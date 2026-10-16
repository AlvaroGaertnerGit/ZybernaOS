import { addMonths, startOfMonth, type IsoDate } from "./dates";
import { monthlyRecurringCents, type ContractForMrr } from "./mrr";
import { outstanding } from "./payments";
import type { Cents } from "./money";

/**
 * Cálculos del dashboard. Se distinguen cuatro magnitudes que no deben mezclarse:
 *  - Facturación prevista: importes de cobros previstos con vencimiento en el periodo.
 *  - Ingresos recurrentes (MRR/ARR): normalización mensual de contrataciones activas.
 *  - Cobros reales: movimientos de cobro registrados con fecha en el periodo.
 *  - Pendiente de cobro: importe no cobrado de cobros previstos no anulados.
 */

export interface TxRow {
  amount_cents: Cents;
  paid_on: IsoDate;
}

export interface PaymentRow {
  amount_due_cents: Cents;
  amount_paid_cents: Cents;
  due_date: IsoDate;
  voided_at: string | null;
}

export function collectedBetween(txs: readonly TxRow[], from: IsoDate, to: IsoDate): Cents {
  let total = 0;
  for (const t of txs) if (t.paid_on >= from && t.paid_on <= to) total += t.amount_cents;
  return total;
}

export function expectedBetween(payments: readonly PaymentRow[], from: IsoDate, to: IsoDate): Cents {
  let total = 0;
  for (const p of payments) {
    if (!p.voided_at && p.due_date >= from && p.due_date <= to) total += p.amount_due_cents;
  }
  return total;
}

export type PendingScope = "all" | "overdue" | "upcoming";

export function pendingSummary(payments: readonly PaymentRow[], today: IsoDate) {
  let overdue = 0;
  let upcoming = 0;
  let overdueCount = 0;
  let upcomingCount = 0;
  for (const p of payments) {
    const o = outstanding(p);
    if (o === 0) continue;
    if (p.due_date < today) {
      overdue += o;
      overdueCount++;
    } else {
      upcoming += o;
      upcomingCount++;
    }
  }
  return { overdue, upcoming, total: overdue + upcoming, overdueCount, upcomingCount };
}

/** Serie mensual de los últimos `months` meses (incluido el actual): cobrado vs previsto. */
export function monthlySeries(
  txs: readonly TxRow[],
  payments: readonly PaymentRow[],
  today: IsoDate,
  months = 12,
): { month: IsoDate; collected: Cents; expected: Cents }[] {
  const current = startOfMonth(today);
  const out: { month: IsoDate; collected: Cents; expected: Cents }[] = [];
  const idx = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonths(current, -i);
    idx.set(m.slice(0, 7), out.length);
    out.push({ month: m, collected: 0, expected: 0 });
  }
  for (const t of txs) {
    const i = idx.get(t.paid_on.slice(0, 7));
    if (i !== undefined) out[i].collected += t.amount_cents;
  }
  for (const p of payments) {
    if (p.voided_at) continue;
    const i = idx.get(p.due_date.slice(0, 7));
    if (i !== undefined) out[i].expected += p.amount_due_cents;
  }
  return out;
}

export interface CategorizedContract extends ContractForMrr {
  category_name: string;
}

export function mrrByCategory(contracts: readonly CategorizedContract[]) {
  const map = new Map<string, Cents>();
  for (const c of contracts) {
    if (c.status !== "active") continue;
    const v = monthlyRecurringCents(c);
    if (v === 0) continue;
    map.set(c.category_name, (map.get(c.category_name) ?? 0) + v);
  }
  return [...map.entries()].map(([category, mrr]) => ({ category, mrr })).sort((a, b) => b.mrr - a.mrr);
}

export function serviceDistribution(contracts: readonly CategorizedContract[]) {
  const map = new Map<string, number>();
  for (const c of contracts) {
    if (c.status !== "active") continue;
    map.set(c.category_name, (map.get(c.category_name) ?? 0) + 1);
  }
  return [...map.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
}
