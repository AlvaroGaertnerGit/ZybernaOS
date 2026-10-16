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

/** Totales del filtro actual (previsto / cobrado / pendiente). */
export async function paymentTotals(filters: PaymentFilters) {
  const supabase = await db();
  const f = normalize(filters);
  const query = applyFilters(
    supabase.from("payments_view").select("amount_due_cents, amount_paid_cents, amount_outstanding_cents, status"),
    f,
  );
  const rows = unwrap(await query.limit(20_000), "los totales");
  let due = 0;
  let paid = 0;
  let outstanding = 0;
  let overdue = 0;
  for (const r of rows) {
    if (r.status === "void") continue;
    due += r.amount_due_cents;
    paid += r.amount_paid_cents;
    outstanding += r.amount_outstanding_cents;
    if (r.status === "overdue") overdue += r.amount_outstanding_cents;
  }
  return { due, paid, outstanding, overdue, count: rows.length };
}

export async function listPaymentsForExport(filters: PaymentFilters = {}, limit = 20_000) {
  const supabase = await db();
  const query = applyFilters(supabase.from("payments_view").select("*"), normalize(filters));
  return unwrap(await query.order("code").limit(limit), "los cobros");
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
