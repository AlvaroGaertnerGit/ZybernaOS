import "server-only";

import { addDays, addMonths, endOfMonth, startOfMonth, todayIso, type IsoDate } from "@/lib/calculations/dates";
import {
  collectedBetween,
  expectedBetween,
  monthlySeries,
  mrrByCategory,
  pendingSummary,
  serviceDistribution,
} from "@/lib/calculations/dashboard";
import { arrFromMrr, totalMrr } from "@/lib/calculations/mrr";
import { db, getMembers, unwrap } from "./common";

export async function getDashboard(month?: IsoDate) {
  const supabase = await db();
  const today = todayIso();
  const periodStart = startOfMonth(month ?? today);
  const periodEnd = endOfMonth(periodStart);
  const seriesStart = addMonths(startOfMonth(today), -11);
  const horizon = addDays(today, 30);

  const [activeClients, contracts, txs, payments, upcoming, overdue, renewals, recentClients, activity, members] =
    await Promise.all([
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("status", "active").is("archived_at", null),
      supabase
        .from("client_services_view")
        .select("billing_type, periodicity, interval_count, interval_unit, amount_cents, status, category_name")
        .eq("status", "active")
        .limit(10_000),
      supabase
        .from("payment_transactions")
        .select("amount_cents, paid_on")
        .gte("paid_on", seriesStart < periodStart ? seriesStart : periodStart)
        .limit(50_000),
      supabase
        .from("payments_view")
        .select("amount_due_cents, amount_paid_cents, due_date, voided_at, status")
        .or(`due_date.gte.${seriesStart < periodStart ? seriesStart : periodStart},status.in.(pending,partial,overdue)`)
        .limit(50_000),
      supabase
        .from("payments_view")
        .select("id, code, concept, client_id, client_name, due_date, amount_outstanding_cents, currency, status")
        .in("status", ["pending", "partial"])
        .gte("due_date", today)
        .lte("due_date", horizon)
        .order("due_date")
        .limit(6),
      supabase
        .from("payments_view")
        .select("id, code, concept, client_id, client_name, due_date, amount_outstanding_cents, currency, status")
        .eq("status", "overdue")
        .order("due_date")
        .limit(6),
      supabase
        .from("client_services_view")
        .select("id, name, client_id, client_name, next_renewal_date, amount_cents, currency, periodicity, interval_count, interval_unit")
        .eq("status", "active")
        .gte("next_renewal_date", today)
        .lte("next_renewal_date", addDays(today, 45))
        .order("next_renewal_date")
        .limit(6),
      supabase
        .from("clients_view")
        .select("id, trade_name, status, joined_on, mrr_cents, created_at")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(8),
      getMembers(),
    ]);

  const contractRows = unwrap(contracts, "las contrataciones");
  const txRows = unwrap(txs, "los cobros");
  const paymentRows = unwrap(payments, "los cobros previstos");
  const mrr = totalMrr(contractRows);
  const pending = pendingSummary(paymentRows, today);
  const memberNames = new Map(members.map((m) => [m.id, m.full_name || m.email]));

  return {
    today,
    period: { start: periodStart, end: periodEnd },
    kpis: {
      activeClients: activeClients.count ?? 0,
      activeContracts: contractRows.length,
      mrr,
      arr: arrFromMrr(mrr),
      collectedInPeriod: collectedBetween(txRows, periodStart, periodEnd),
      expectedInPeriod: expectedBetween(paymentRows, periodStart, periodEnd),
      pending,
    },
    series: monthlySeries(txRows, paymentRows, today, 12),
    mrrByCategory: mrrByCategory(contractRows),
    distribution: serviceDistribution(contractRows),
    upcoming: unwrap(upcoming, "los vencimientos"),
    overdue: unwrap(overdue, "los atrasos"),
    renewals: unwrap(renewals, "las renovaciones"),
    recentClients: unwrap(recentClients, "los clientes"),
    activity: unwrap(activity, "la actividad").map((a) => ({
      ...a,
      actor: a.actor_id ? (memberNames.get(a.actor_id) ?? "Miembro") : "Sistema",
    })),
  };
}
