"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CONTRACT_STATUSES } from "@/lib/domain";
import { contractSchema, generatePaymentsSchema } from "@/lib/validations/schemas";
import { uuid, type ActionResult } from "@/lib/validations/common";
import { planPayments } from "@/lib/calculations/billing";
import { addMonths, todayIso } from "@/lib/calculations/dates";
import { dbErrorMessage, memberAction } from "./_helpers";
import { saveContract } from "./contracts-core";

function revalidateContracts(clientId?: string, contractId?: string) {
  revalidatePath("/contrataciones");
  revalidatePath("/dashboard");
  revalidatePath("/clientes");
  if (clientId) revalidatePath(`/clientes/${clientId}`);
  if (contractId) revalidatePath(`/contrataciones/${contractId}`);
}

export async function createContractAction(input: unknown): Promise<ActionResult<{ id: string; code: string }>> {
  return memberAction(contractSchema, input, async (data, { supabase }) => {
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
    const { data: existing } = await supabase.from("client_services").select("client_id").eq("id", id).maybeSingle();
    if (!existing) return { ok: false, error: "La contratación no existe." };
    if (existing.client_id !== values.client_id) {
      return { ok: false, error: "No se puede cambiar el cliente de una contratación existente." };
    }
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
