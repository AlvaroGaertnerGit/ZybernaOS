"use server";

import { uuid, type ActionResult } from "@/lib/validations/common";
import type { TransactionRow } from "@/types/database";
import { memberAction } from "./_helpers";

/** Lectura bajo demanda del historial de un cobro (desde diálogos cliente). */
export async function loadTransactionsAction(paymentId: string): Promise<ActionResult<TransactionRow[]>> {
  return memberAction(uuid, paymentId, async (id, { supabase }) => {
    const { data, error } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("payment_id", id)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: "No se pudo cargar el historial." };
    return { ok: true, data: data ?? [] };
  });
}
