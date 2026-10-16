"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { paymentSchema, transactionSchema } from "@/lib/validations/schemas";
import { uuid, type ActionResult } from "@/lib/validations/common";
import { canRecordPayment } from "@/lib/calculations/payments";
import { dbErrorMessage, memberAction } from "./_helpers";

function revalidatePayments(clientId?: string, contractId?: string | null) {
  revalidatePath("/cobros");
  revalidatePath("/dashboard");
  if (clientId) revalidatePath(`/clientes/${clientId}`);
  if (contractId) revalidatePath(`/contrataciones/${contractId}`);
}

export async function createPaymentAction(input: unknown): Promise<ActionResult<{ id: string; code: string }>> {
  return memberAction(paymentSchema, input, async (data, { supabase }) => {
    if (data.client_service_id) {
      const { data: contract } = await supabase
        .from("client_services")
        .select("client_id")
        .eq("id", data.client_service_id)
        .maybeSingle();
      if (!contract || contract.client_id !== data.client_id) {
        return { ok: false, error: "La contratación no pertenece a ese cliente." };
      }
    }
    const { amount_due, ...rest } = data;
    const { data: row, error } = await supabase
      .from("payments")
      .insert({ ...rest, amount_due_cents: amount_due })
      .select("id, code")
      .single();
    if (error) return { ok: false, error: dbErrorMessage(error) };
    revalidatePayments(data.client_id, data.client_service_id);
    return { ok: true, data: row, message: "Cobro previsto creado." };
  });
}

export async function updatePaymentAction(id: string, input: unknown): Promise<ActionResult> {
  return memberAction(z.object({ id: uuid, values: paymentSchema }), { id, values: input }, async ({ id, values }, { supabase }) => {
    const { data: current } = await supabase
      .from("payments")
      .select("client_id, amount_paid_cents")
      .eq("id", id)
      .maybeSingle();
    if (!current) return { ok: false, error: "El cobro no existe." };
    if (current.client_id !== values.client_id) return { ok: false, error: "No se puede cambiar el cliente de un cobro." };
    if (values.amount_due < current.amount_paid_cents) {
      return { ok: false, error: "El importe previsto no puede ser inferior a lo ya cobrado." };
    }
    const { amount_due, ...rest } = values;
    const { error } = await supabase.from("payments").update({ ...rest, amount_due_cents: amount_due }).eq("id", id);
    if (error) return { ok: false, error: dbErrorMessage(error) };
    revalidatePayments(values.client_id, values.client_service_id);
    return { ok: true, data: undefined, message: "Cobro actualizado." };
  });
}

/**
 * Registra un movimiento de cobro (total o parcial). La clave de idempotencia la
 * genera el formulario al abrirse: un doble envío no duplica el cobro.
 */
export async function recordTransactionAction(input: unknown): Promise<ActionResult<{ duplicate: boolean }>> {
  return memberAction<typeof transactionSchema, { duplicate: boolean }>(transactionSchema, input, async (data, { supabase }) => {
    const { data: payment } = await supabase
      .from("payments")
      .select("id, client_id, client_service_id, amount_due_cents, amount_paid_cents, voided_at")
      .eq("id", data.payment_id)
      .maybeSingle();
    if (!payment) return { ok: false, error: "El cobro no existe." };

    const { data: already } = await supabase
      .from("payment_transactions")
      .select("id")
      .eq("idempotency_key", data.idempotency_key)
      .maybeSingle();
    if (already) return { ok: true, data: { duplicate: true }, message: "Este cobro ya estaba registrado." };

    const check = canRecordPayment(payment, data.amount);
    if (!check.ok) return { ok: false, error: check.reason };

    const { error } = await supabase.from("payment_transactions").insert({
      payment_id: data.payment_id,
      amount_cents: data.amount,
      paid_on: data.paid_on,
      method: data.method,
      note: data.note,
      idempotency_key: data.idempotency_key,
      kind: "payment",
    });
    if (error) {
      if (error.code === "23505") return { ok: true, data: { duplicate: true }, message: "Este cobro ya estaba registrado." };
      return { ok: false, error: dbErrorMessage(error) };
    }
    revalidatePayments(payment.client_id, payment.client_service_id);
    return { ok: true, data: { duplicate: false }, message: "Cobro registrado." };
  });
}

/** Elimina un movimiento registrado por error (queda reflejado en los totales al instante). */
export async function deleteTransactionAction(id: string): Promise<ActionResult> {
  return memberAction(uuid, id, async (txId, { supabase }) => {
    const { data: tx } = await supabase
      .from("payment_transactions")
      .select("id, payment_id")
      .eq("id", txId)
      .maybeSingle();
    if (!tx) return { ok: false, error: "El movimiento no existe." };
    const { error } = await supabase.from("payment_transactions").delete().eq("id", txId);
    if (error) return { ok: false, error: dbErrorMessage(error) };
    revalidatePayments();
    return { ok: true, data: undefined, message: "Movimiento eliminado." };
  });
}

export async function setPaymentVoidAction(id: string, voided: boolean): Promise<ActionResult> {
  return memberAction(z.object({ id: uuid, voided: z.boolean() }), { id, voided }, async (v, { supabase }) => {
    const { data: p } = await supabase
      .from("payments")
      .select("client_id, client_service_id, amount_paid_cents")
      .eq("id", v.id)
      .maybeSingle();
    if (!p) return { ok: false, error: "El cobro no existe." };
    if (v.voided && p.amount_paid_cents > 0) {
      return { ok: false, error: "No se puede anular un cobro con importes cobrados. Elimina antes los movimientos." };
    }
    const { error } = await supabase
      .from("payments")
      .update({ voided_at: v.voided ? new Date().toISOString() : null })
      .eq("id", v.id);
    if (error) return { ok: false, error: dbErrorMessage(error) };
    revalidatePayments(p.client_id, p.client_service_id);
    return { ok: true, data: undefined, message: v.voided ? "Cobro anulado." : "Cobro reactivado." };
  });
}
