import "server-only";

import type { ServerSupabase } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validations/common";
import type { ContractInput } from "@/lib/validations/schemas";
import { dbErrorMessage } from "./_helpers";

type ContractValues = Omit<ContractInput, "code" | "client_id"> & { code: string | null; client_id?: string };

/** Valores de la contratación en el formato de la tabla client_services. */
export function contractRow(v: ContractValues) {
  const recurring = v.billing_type === "recurring";
  return {
    code: v.code,
    ...(v.client_id ? { client_id: v.client_id } : {}),
    service_id: v.service_id,
    category_id: v.category_id,
    name: v.name,
    description: v.description,
    amount_cents: v.amount,
    tax_rate: v.tax_rate,
    currency: v.currency,
    billing_type: v.billing_type,
    periodicity: recurring ? v.periodicity : null,
    interval_count: recurring && v.periodicity === "custom" ? v.interval_count : null,
    interval_unit: recurring && v.periodicity === "custom" ? v.interval_unit : null,
    start_date: v.start_date,
    end_date: v.end_date,
    next_renewal_date: recurring ? v.next_renewal_date : null,
    status: v.status,
    owner_id: v.owner_id,
    notes: v.notes,
  };
}

/** Alta o edición atómica (contratación + prestaciones) mediante la RPC save_contract. */
export async function saveContract(
  supabase: ServerSupabase,
  id: string | null,
  v: ContractValues,
): Promise<ActionResult<{ id: string; code: string }>> {
  const { data, error } = await supabase.rpc("save_contract", {
    p_id: id,
    p_values: contractRow(v),
    p_deliverables: v.deliverables,
  });
  if (error) return { ok: false, error: dbErrorMessage(error) };
  const result = data as { id: string; code: string };
  return { ok: true, data: result };
}
