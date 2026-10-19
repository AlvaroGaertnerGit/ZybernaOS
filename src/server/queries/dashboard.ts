import "server-only";

import { addDays, addMonths, endOfMonth, startOfMonth, todayIso, type IsoDate } from "@/lib/calculations/dates";
import type { Cents } from "@/lib/calculations/money";
import { arrFromMrr } from "@/lib/calculations/mrr";
import { db, getMembers, unwrap } from "./common";

/** Respuesta de la RPC `dashboard_summary` (mismas definiciones que lib/calculations/dashboard.ts). */
interface DashboardSummary {
  collectedInPeriod: Cents;
  expectedInPeriod: Cents;
  pending: { overdue: Cents; upcoming: Cents; overdueCount: number; upcomingCount: number };
  series: { month: IsoDate; collected: Cents; expected: Cents }[];
  activeContracts: number;
  mrr: Cents;
  categories: { category: string; count: number; mrr: Cents }[];
}

/** Respuesta de la RPC `variable_summary` (periodos variables que empiezan en el periodo). */
interface VariableSummary {
  determined: Cents;
  determinedCount: number;
  pendingCount: number;
  billed: Cents;
}

export async function getDashboard(month?: IsoDate) {
  const supabase = await db();
  const today = todayIso();
  const periodStart = startOfMonth(month ?? today);
  const periodEnd = endOfMonth(periodStart);
  const seriesStart = addMonths(startOfMonth(today), -11);
  const horizon = addDays(today, 30);

  // Cifras agregadas en SQL: exactas con cualquier volumen (la API limita cada respuesta a 1.000 filas).
  const [activeClients, summary, upcoming, overdue, renewals, recentClients, activity, members, variable] =
    await Promise.all([
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("status", "active").is("archived_at", null),
      supabase.rpc("dashboard_summary", {
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_series_start: seriesStart,
        p_today: today,
      }),
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
      supabase.rpc("variable_summary", { p_period_start: periodStart, p_period_end: periodEnd }),
    ]);

  const sum = unwrap(summary, "las métricas") as unknown as DashboardSummary;
  const pending = { ...sum.pending, total: sum.pending.overdue + sum.pending.upcoming };
  const memberNames = new Map(members.map((m) => [m.id, m.full_name || m.email]));

  return {
    today,
    period: { start: periodStart, end: periodEnd },
    kpis: {
      activeClients: activeClients.count ?? 0,
      activeContracts: sum.activeContracts,
      mrr: sum.mrr,
      arr: arrFromMrr(sum.mrr),
      collectedInPeriod: sum.collectedInPeriod,
      expectedInPeriod: sum.expectedInPeriod,
      pending,
    },
    // El variable no es MRR ni ingreso confirmado: solo se informa (determinado / pendiente).
    variable: unwrap(variable, "el componente variable") as unknown as VariableSummary,
    series: sum.series,
    mrrByCategory: sum.categories
      .filter((c) => c.mrr > 0)
      .map((c) => ({ category: c.category, mrr: c.mrr }))
      .sort((a, b) => b.mrr - a.mrr),
    distribution: sum.categories.map((c) => ({ category: c.category, count: c.count })).sort((a, b) => b.count - a.count),
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
