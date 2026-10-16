import "server-only";

import { PAYMENT_STATUSES, type PaymentStatus } from "@/lib/domain";
import { isIsoDate } from "@/lib/calculations/dates";
import type { PaymentsViewRow } from "@/types/database";
import { db, PAGE_SIZE, searchTerm, unwrap, type Paginated } from "./common";

export interface PaymentFilters {
  q?: string;
  status?: string;
  client?: string;
  from?: string;
  to?: string;
  page?: number;
}

function normalize(f: PaymentFilters) {
  const statuses = (f.status ?? "")
    .split(",")
    .filter((s): s is PaymentStatus => PAYMENT_STATUSES.includes(s as PaymentStatus));
  return {
    statuses,
    client: f.client || undefined,
    from: f.from && isIsoDate(f.from) ? f.from : undefined,
    to: f.to && isIsoDate(f.to) ? f.to : undefined,
    q: searchTerm(f.q),
  };
}

// El tipo genérico del builder de PostgREST es complejo; se aplica el filtro con un helper tipado laxamente.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters<Q extends { in: any; eq: any; gte: any; lte: any; or: any }>(query: Q, f: ReturnType<typeof normalize>): Q {
  let q = query;
  if (f.statuses.length) q = q.in("status", f.statuses);
  if (f.client) q = q.eq("client_id", f.client);
  if (f.from) q = q.gte("due_date", f.from);
  if (f.to) q = q.lte("due_date", f.to);
  if (f.q) q = q.or(`concept.ilike.%${f.q}%,client_name.ilike.%${f.q}%,code.ilike.%${f.q}%,invoice_ref.ilike.%${f.q}%`);
  return q;
}

export async function listPayments(filters: PaymentFilters): Promise<Paginated<PaymentsViewRow>> {
  const supabase = await db();
  const page = filters.page ?? 1;
  const f = normalize(filters);
  const query = applyFilters(supabase.from("payments_view").select("*", { count: "exact" }), f);
  const from = (page - 1) * PAGE_SIZE;
  const res = await query.order("due_date", { ascending: false }).order("id").range(from, from + PAGE_SIZE - 1);
  const rows = unwrap(res, "los cobros");
  return { rows, total: res.count ?? rows.length, page, pageSize: PAGE_SIZE };
}

/**
 * Totales del filtro actual (previsto / cobrado / pendiente), agregados en SQL
 * (RPC `payment_totals`): exactos con cualquier número de cobros.
 */
export async function paymentTotals(filters: PaymentFilters) {
  const supabase = await db();
  const f = normalize(filters);
  const res = await supabase.rpc("payment_totals", {
    p_statuses: f.statuses.length ? f.statuses : null,
    p_client: f.client ?? null,
    p_from: f.from ?? null,
    p_to: f.to ?? null,
    p_q: f.q,
  });
  return unwrap(res, "los totales") as { due: number; paid: number; outstanding: number; overdue: number; count: number };
}

export async function getPaymentTransactions(paymentId: string) {
  const supabase = await db();
  const res = await supabase
    .from("payment_transactions")
    .select("*")
    .eq("payment_id", paymentId)
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false });
  return unwrap(res, "los movimientos");
}

export async function openPaymentOptions() {
  const supabase = await db();
  const res = await supabase
    .from("payments_view")
    .select("id, code, concept, client_name, amount_outstanding_cents, currency, due_date, status")
    .in("status", ["pending", "partial", "overdue"])
    .order("due_date")
    .limit(500);
  return unwrap(res, "los cobros pendientes");
}
