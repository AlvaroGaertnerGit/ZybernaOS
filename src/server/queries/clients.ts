import "server-only";

import { CLIENT_STATUSES, type ClientStatus } from "@/lib/domain";
import type { ClientsViewRow } from "@/types/database";
import { fetchAll } from "@/lib/fetch-all";
import { db, PAGE_SIZE, searchTerm, unwrap, type Paginated } from "./common";

export const CLIENT_SORTS = ["trade_name", "joined_on", "mrr_cents", "status", "active_services"] as const;
export type ClientSort = (typeof CLIENT_SORTS)[number];

export interface ClientFilters {
  q?: string;
  status?: string;
  owner?: string;
  archived?: boolean;
  sort?: string;
  dir?: string;
  page?: number;
  pageSize?: number;
}

export function normalizeClientFilters(f: ClientFilters) {
  const status = CLIENT_STATUSES.includes(f.status as ClientStatus) ? (f.status as ClientStatus) : undefined;
  const sort: ClientSort = CLIENT_SORTS.includes(f.sort as ClientSort) ? (f.sort as ClientSort) : "trade_name";
  const ascending = f.dir ? f.dir !== "desc" : sort === "trade_name";
  return { q: searchTerm(f.q), status, owner: f.owner || undefined, archived: Boolean(f.archived), sort, ascending };
}

export async function listClients(filters: ClientFilters): Promise<Paginated<ClientsViewRow>> {
  const supabase = await db();
  const f = normalizeClientFilters(filters);
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? PAGE_SIZE;

  let query = supabase.from("clients_view").select("*", { count: "exact" });
  query = f.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (f.status) query = query.eq("status", f.status);
  if (f.owner) query = f.owner === "none" ? query.is("owner_id", null) : query.eq("owner_id", f.owner);
  if (f.q) {
    const like = `%${f.q}%`;
    query = query.or(
      `trade_name.ilike.${like},legal_name.ilike.${like},contact_name.ilike.${like},email.ilike.${like},code.ilike.${like},tax_id.ilike.${like}`,
    );
  }
  query = query.order(f.sort, { ascending: f.ascending, nullsFirst: false }).order("id");
  const from = (page - 1) * pageSize;
  const res = await query.range(from, from + pageSize - 1);
  const rows = unwrap(res, "los clientes");
  return { rows, total: res.count ?? rows.length, page, pageSize };
}

export async function getClient(id: string) {
  const supabase = await db();
  const res = await supabase.from("clients_view").select("*").eq("id", id).maybeSingle();
  return unwrap(res, "el cliente");
}

export async function getClientDetail(id: string) {
  const supabase = await db();
  const [contracts, payments, notes, activity] = await Promise.all([
    supabase.from("client_services_view").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    supabase
      .from("payments_view")
      .select("*")
      .eq("client_id", id)
      .order("due_date", { ascending: false })
      .limit(200),
    supabase.from("client_notes").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("activity_log").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  const contractRows = unwrap(contracts, "las contrataciones");
  const ids = contractRows.map((c) => c.id);
  const deliverables = ids.length
    ? unwrap(
        await supabase
          .from("client_service_deliverables")
          .select("*")
          .in("client_service_id", ids)
          .order("position"),
        "las prestaciones",
      )
    : [];
  return {
    contracts: contractRows,
    payments: unwrap(payments, "los cobros"),
    notes: unwrap(notes, "las notas"),
    activity: unwrap(activity, "la actividad"),
    deliverables,
  };
}

/** Opciones ligeras para selectores de cliente. */
export async function clientOptions() {
  const supabase = await db();
  return fetchAll(
    (from, to) => supabase.from("clients").select("id, code, trade_name").is("archived_at", null).order("trade_name").order("id").range(from, to),
    "los clientes",
  );
}
