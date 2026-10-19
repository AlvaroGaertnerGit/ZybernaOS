import "server-only";

import type { ServerSupabase } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validations/common";
import type { ContractInput } from "@/lib/validations/schemas";
import { LIVE_CONTRACT_STATUSES } from "@/lib/domain";
import { checkAgainstExisting, findViolations, isLiveStatus, shouldCheckRequires, type RuleService } from "@/lib/catalog/rules";
import { fetchAll } from "@/lib/fetch-all";
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
    project: v.project,
    variable_rate: v.variable_rate,
    variable_basis: v.variable_rate === null ? null : v.variable_basis,
  };
}

/** Reglas del catálogo (ids, keys, grupos, dependencias e incompatibilidades). */
export async function catalogRules(supabase: ServerSupabase): Promise<RuleService[]> {
  return fetchAll(
    (f, t) =>
      supabase
        .from("service_catalog")
        .select("id, key, name, exclusive_group, requires_any, excludes, default_price_cents")
        .order("id")
        .range(f, t),
    "las reglas del catálogo",
  );
}

/**
 * Comprobación previa de las reglas (mensaje claro antes de escribir). La garantía la
 * da la base de datos: el trigger check_contract_rules rechaza igualmente cualquier
 * combinación inválida que llegue por otra vía.
 */
export async function checkContractRules(
  supabase: ServerSupabase,
  id: string | null,
  v: Pick<ContractValues, "service_id" | "project" | "status"> & { client_id: string },
  previous: { service_id: string | null; status: string } | null = null,
): Promise<string | null> {
  // Las contrataciones cerradas no participan en las reglas: no hace falta consultar nada.
  if (!v.service_id || !isLiveStatus(v.status)) return null;
  const [rules, existing] = await Promise.all([
    catalogRules(supabase),
    fetchAll(
      (f, t) =>
        supabase
          .from("client_services")
          .select("id, code, name, service_id, project, status")
          .eq("client_id", v.client_id)
          .in("status", [...LIVE_CONTRACT_STATUSES])
          .order("id")
          .range(f, t),
      "las contrataciones del cliente",
    ),
  ]);
  const problems = checkAgainstExisting({ id, service_id: v.service_id, project: v.project, status: v.status }, existing, rules, {
    checkRequires: shouldCheckRequires(previous, v.service_id),
  });
  return problems[0] ?? null;
}

/** Valida en bloque las contrataciones de un alta guiada (mismo cliente). */
export async function checkSelectionRules(
  supabase: ServerSupabase,
  items: { service_id: string | null; project: string | null; status: string }[],
): Promise<string | null> {
  if (!items.some((i) => i.service_id)) return null;
  const violations = findViolations(items, await catalogRules(supabase));
  return violations[0]?.message ?? null;
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
