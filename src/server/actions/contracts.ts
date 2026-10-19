"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CONTRACT_STATUSES } from "@/lib/domain";
import { contractSchema, generatePaymentsSchema, variablePeriodSchema } from "@/lib/validations/schemas";
import { isoDate, uuid, type ActionResult } from "@/lib/validations/common";
import { planPayments } from "@/lib/calculations/billing";
import { addMonths, todayIso } from "@/lib/calculations/dates";
import { dbErrorMessage, memberAction } from "./_helpers";
import { checkContractRules, saveContract } from "./contracts-core";

function revalidateContracts(clientId?: string, contractId?: string) {
  revalidatePath("/contrataciones");
  revalidatePath("/dashboard");
  revalidatePath("/clientes");
  if (clientId) revalidatePath(`/clientes/${clientId}`);
  if (contractId) revalidatePath(`/contrataciones/${contractId}`);
}

export async function createContractAction(input: unknown): Promise<ActionResult<{ id: string; code: string }>> {
  return memberAction(contractSchema, input, async (data, { supabase }) => {
    const ruleError = await checkContractRules(supabase, null, data);
    if (ruleError) return { ok: false, error: ruleError, fieldErrors: { service_id: [ruleError] } };
    const res = await saveContract(supabase, null, data);
    if (res.ok) {
      revalidateContracts(data.client_id, res.data.id);
      return { ...res, message: "Contratación creada." };
    }
    return res;
  });
}

export async function updateContractAction(id: string, input: unknown): Promise<ActionResult<{ id: string; code: string }>> {
  return memberAction(z.object({ id: uuid, values: contractSchema }), { id, values: input }, async ({ id, values }, { supabase }) => {
    const { data: existing } = await supabase
      .from("client_services")
      .select("client_id, service_id, status")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return { ok: false, error: "La contratación no existe." };
    if (existing.client_id !== values.client_id) {
      return { ok: false, error: "No se puede cambiar el cliente de una contratación existente." };
    }
    const ruleError = await checkContractRules(supabase, id, values, existing);
    if (ruleError) return { ok: false, error: ruleError, fieldErrors: { service_id: [ruleError] } };
    const res = await saveContract(supabase, id, values);
    if (res.ok) {
      revalidateContracts(values.client_id, id);
      return { ...res, message: "Cambios guardados." };
    }
    return res;
  });
}

export async function setContractStatusAction(id: string, status: string): Promise<ActionResult> {
  return memberAction(z.object({ id: uuid, status: z.enum(CONTRACT_STATUSES) }), { id, status }, async (v, { supabase }) => {
    const { data: current } = await supabase
      .from("client_services")
      .select("client_id, service_id, project, status")
      .eq("id", v.id)
      .maybeSingle();
    if (!current) return { ok: false, error: "La contratación no existe." };
    const ruleError = await checkContractRules(supabase, v.id, { ...current, status: v.status }, current);
    if (ruleError) return { ok: false, error: ruleError };
    const { data, error } = await supabase
      .from("client_services")
      .update({ status: v.status })
      .eq("id", v.id)
      .select("client_id")
      .single();
    if (error) return { ok: false, error: dbErrorMessage(error) };
    revalidateContracts(data.client_id, v.id);
    return { ok: true, data: undefined, message: "Estado actualizado." };
  });
}

/**
 * Genera cobros previstos para los periodos pendientes hasta una fecha (máx. 12 por ejecución).
 * Idempotente: un cobro por (contratación, periodo) garantizado por índice único.
 */
export async function generatePaymentsAction(input: unknown): Promise<ActionResult<{ created: number }>> {
  return memberAction(generatePaymentsSchema, input, async ({ contract_id, until }, { supabase }) => {
    const maxUntil = addMonths(todayIso(), 24);
    if (until > maxUntil) return { ok: false, error: "Solo se pueden generar cobros hasta 24 meses vista." };

    const [{ data: contract, error }, { data: existing, error: exErr }] = await Promise.all([
      supabase.from("client_services").select("*").eq("id", contract_id).maybeSingle(),
      supabase.from("payments").select("period_start").eq("client_service_id", contract_id).not("period_start", "is", null),
    ]);
    if (error || exErr) return { ok: false, error: "No se pudo leer la contratación." };
    if (!contract) return { ok: false, error: "La contratación no existe." };
    if (contract.status !== "active") return { ok: false, error: "Solo se generan cobros para contrataciones activas." };
    if (contract.amount_cents <= 0) return { ok: false, error: "La contratación no tiene importe." };

    const plan = planPayments(contract, {
      until,
      existingPeriods: new Set((existing ?? []).map((p) => p.period_start as string)),
      limit: 12,
    });
    if (plan.length === 0) return { ok: true, data: { created: 0 }, message: "No hay periodos pendientes de generar." };

    const { data: created, error: rpcErr } = await supabase.rpc("create_scheduled_payments", {
      p_contract_id: contract_id,
      p_items: plan,
    });
    if (rpcErr) return { ok: false, error: dbErrorMessage(rpcErr) };
    revalidateContracts(contract.client_id, contract_id);
    revalidatePath("/cobros");
    const n = created ?? 0;
    return { ok: true, data: { created: n }, message: n === 1 ? "1 cobro previsto creado." : `${n} cobros previstos creados.` };
  });
}

// ---------------------------------------------------------------------------
// Componente variable (p. ej. % de beneficios mensuales)
// ---------------------------------------------------------------------------

/**
 * Registra o actualiza el periodo de un componente variable. Sin importe de la base, el
 * periodo queda pendiente. El porcentaje y la base se copian de la contratación. Nunca
 * crea un cobro: eso se hace a petición explícita con createVariablePaymentAction.
 */
export async function saveVariablePeriodAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  return memberAction(
    z.object({ id: uuid.nullable(), values: variablePeriodSchema }),
    { id, values: input },
    async ({ id, values }, { supabase }) => {
      const { data: contract } = await supabase
        .from("client_services")
        .select("id, client_id, variable_rate, variable_basis")
        .eq("id", values.contract_id)
        .maybeSingle();
      if (!contract) return { ok: false, error: "La contratación no existe." };
      if (contract.variable_rate === null || contract.variable_basis === null) {
        return { ok: false, error: "Esta contratación no tiene componente variable." };
      }
      const row = {
        period_start: values.period_start,
        period_end: values.period_end,
        base_amount_cents: values.base_amount,
        notes: values.notes,
      };
      const res = id
        ? await supabase.from("contract_variable_periods").update(row).eq("id", id).eq("client_service_id", contract.id).select("id").single()
        : await supabase
            .from("contract_variable_periods")
            .insert({ ...row, client_service_id: contract.id, rate: contract.variable_rate, basis: contract.variable_basis })
            .select("id")
            .single();
      if (res.error) {
        const msg = res.error.code === "23505" ? "Ya existe un periodo que empieza en esa fecha." : dbErrorMessage(res.error);
        return { ok: false, error: msg };
      }
      revalidateContracts(contract.client_id, contract.id);
      return { ok: true, data: { id: res.data.id }, message: id ? "Periodo actualizado." : "Periodo registrado." };
    },
  );
}

export async function deleteVariablePeriodAction(id: string, contractId: string): Promise<ActionResult> {
  return memberAction(z.object({ id: uuid, contractId: uuid }), { id, contractId }, async (v, { supabase }) => {
    const { data, error } = await supabase
      .from("contract_variable_periods")
      .delete()
      .eq("id", v.id)
      .eq("client_service_id", v.contractId)
      .is("payment_id", null)
      .select("id");
    if (error) return { ok: false, error: dbErrorMessage(error) };
    if (!data?.length) return { ok: false, error: "No se puede eliminar: el periodo ya tiene un cobro previsto." };
    revalidateContracts(undefined, v.contractId);
    return { ok: true, data: undefined, message: "Periodo eliminado." };
  });
}

/** Crea el cobro previsto de un periodo variable ya determinado (solo a petición). */
export async function createVariablePaymentAction(periodId: string, contractId: string, dueDate: string): Promise<ActionResult> {
  return memberAction(
    z.object({ periodId: uuid, contractId: uuid, dueDate: isoDate("Vencimiento") }),
    { periodId, contractId, dueDate },
    async (v, { supabase }) => {
      const { error } = await supabase.rpc("create_variable_payment", { p_period_id: v.periodId, p_due_date: v.dueDate });
      if (error) return { ok: false, error: dbErrorMessage(error) };
      revalidateContracts(undefined, v.contractId);
      revalidatePath("/cobros");
      return { ok: true, data: undefined, message: "Cobro previsto creado." };
    },
  );
}
