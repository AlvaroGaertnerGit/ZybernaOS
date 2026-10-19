import "server-only";

import { BILLING_TYPES, CONTRACT_STATUSES, LIVE_CONTRACT_STATUSES, type BillingType, type ContractStatus } from "@/lib/domain";
import type { ContractsViewRow } from "@/types/database";
import { fetchAll } from "@/lib/fetch-all";
import { db, PAGE_SIZE, searchTerm, unwrap, type Paginated } from "./common";

export const CONTRACT_SORTS = ["name", "client_name", "amount_cents", "mrr_cents", "start_date", "next_renewal_date", "status"] as const;
type ContractSort = (typeof CONTRACT_SORTS)[number];

export interface ContractFilters {
  q?: string;
  status?: string;
  category?: string;
  billing?: string;
  client?: string;
  sort?: string;
  dir?: string;
  page?: number;
}

export async function listContracts(filters: ContractFilters): Promise<Paginated<ContractsViewRow>> {
  const supabase = await db();
  const page = filters.page ?? 1;
  const sort: ContractSort = CONTRACT_SORTS.includes(filters.sort as ContractSort) ? (filters.sort as ContractSort) : "start_date";
  const ascending = filters.dir ? filters.dir !== "desc" : sort === "name" || sort === "client_name";

  let query = supabase.from("client_services_view").select("*", { count: "exact" });
  if (CONTRACT_STATUSES.includes(filters.status as ContractStatus)) query = query.eq("status", filters.status as ContractStatus);
  if (BILLING_TYPES.includes(filters.billing as BillingType)) query = query.eq("billing_type", filters.billing as BillingType);
  if (filters.category) query = query.eq("category_slug", filters.category);
  if (filters.client) query = query.eq("client_id", filters.client);
  const q = searchTerm(filters.q);
  if (q) query = query.or(`name.ilike.%${q}%,client_name.ilike.%${q}%,code.ilike.%${q}%`);

  const from = (page - 1) * PAGE_SIZE;
  const res = await query.order(sort, { ascending, nullsFirst: false }).order("id").range(from, from + PAGE_SIZE - 1);
  const rows = unwrap(res, "las contrataciones");
  return { rows, total: res.count ?? rows.length, page, pageSize: PAGE_SIZE };
}

export async function getContract(id: string) {
  const supabase = await db();
  const [contract, deliverables, payments] = await Promise.all([
    supabase.from("client_services_view").select("*").eq("id", id).maybeSingle(),
    supabase.from("client_service_deliverables").select("*").eq("client_service_id", id).order("position"),
    supabase.from("payments_view").select("*").eq("client_service_id", id).order("due_date", { ascending: false }).limit(100),
  ]);
  return {
    contract: unwrap(contract, "la contratación"),
    deliverables: unwrap(deliverables, "las prestaciones"),
    payments: unwrap(payments, "los cobros"),
  };
}

/** Contrataciones vivas (para validar reglas de combinación en el formulario). */
export async function liveContracts(clientId?: string) {
  const supabase = await db();
  return fetchAll((from, to) => {
    let query = supabase
      .from("client_services")
      .select("id, code, name, client_id, service_id, project, status")
      .in("status", [...LIVE_CONTRACT_STATUSES])
      .not("service_id", "is", null)
      .order("id");
    if (clientId) query = query.eq("client_id", clientId);
    return query.range(from, to);
  }, "las contrataciones vivas");
}

export async function getVariablePeriods(contractId: string) {
  const supabase = await db();
  return fetchAll(
    (f, t) =>
      supabase
        .from("contract_variable_periods")
        .select("*")
        .eq("client_service_id", contractId)
        .order("period_start", { ascending: false })
        .order("id")
        .range(f, t),
    "los periodos variables",
  );
}

export async function contractOptions(clientId?: string) {
  const supabase = await db();
  return fetchAll((from, to) => {
    let query = supabase
      .from("client_services")
      .select("id, code, name, client_id, amount_cents, currency, tax_rate, status")
      .in("status", ["active", "paused", "draft"])
      .order("name")
      .order("id");
    if (clientId) query = query.eq("client_id", clientId);
    return query.range(from, to);
  }, "las contrataciones");
}
