/**
 * Resumen económico de una selección de servicios. Los importes se agrupan por
 * periodicidad: nunca se suman pagos únicos con cuotas, ni cuotas de distinta
 * periodicidad entre sí. El MRR normaliza solo lo recurrente. El componente variable
 * se lista aparte (no tiene importe hasta conocer su base).
 */

import type { BillingType, IntervalUnit, Periodicity, VariableBasis } from "@/lib/domain";
import { computeTax, type Cents } from "./money";
import { monthlyRecurringCents, periodicityLabel } from "./mrr";

export interface SummaryLine {
  name: string;
  billing_type: BillingType;
  periodicity: Periodicity | null;
  interval_count: number | null;
  interval_unit: IntervalUnit | null;
  /** Precio acordado (null si falta o no es válido). */
  amount_cents: Cents | null;
  /** Tarifa del catálogo para esa modalidad, si existe. */
  list_price_cents?: Cents | null;
  tax_rate?: number | null;
  variable_rate?: number | null;
  variable_basis?: VariableBasis | null;
}

export interface SummaryGroup {
  key: string;
  label: string;
  /** Sufijo para mostrar el importe ("/mes", "/trimestre"…); vacío en pago único. */
  suffix: string;
  base: Cents;
  tax: Cents;
  total: Cents;
  hasTax: boolean;
  /** Suma de tarifas de catálogo de las líneas que tienen tarifa. */
  listTotal: Cents;
  /** Rebaja respecto a la tarifa (positivo) y suplemento (positivo). */
  discount: Cents;
  surcharge: Cents;
  count: number;
}

export interface EconomicSummary {
  groups: SummaryGroup[];
  mrr: Cents;
  arr: Cents;
  variable: { name: string; rate: number; basis: VariableBasis }[];
  /** Líneas sin precio válido (no computan). */
  missingPrice: string[];
}

const ORDER = ["one_time", "monthly", "quarterly", "semiannual", "annual"];
const SUFFIX: Record<string, string> = {
  one_time: "",
  monthly: "/mes",
  quarterly: "/trimestre",
  semiannual: "/semestre",
  annual: "/año",
};

function groupKey(l: SummaryLine): string {
  if (l.billing_type === "one_time") return "one_time";
  if (l.periodicity === "custom") return `custom:${l.interval_count ?? 0}:${l.interval_unit ?? ""}`;
  return l.periodicity ?? "monthly";
}

function groupLabel(key: string, l: SummaryLine): string {
  if (key === "one_time") return "Pago único";
  return `Recurrente ${periodicityLabel(l.periodicity, l.interval_count, l.interval_unit).toLowerCase()}`;
}

export function economicSummary(lines: readonly SummaryLine[]): EconomicSummary {
  const groups = new Map<string, SummaryGroup>();
  const missingPrice: string[] = [];
  const variable: EconomicSummary["variable"] = [];
  let mrr = 0;

  for (const l of lines) {
    if (l.variable_rate && l.variable_basis) variable.push({ name: l.name, rate: l.variable_rate, basis: l.variable_basis });
    if (l.amount_cents === null) {
      missingPrice.push(l.name);
      continue;
    }
    const key = groupKey(l);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        label: groupLabel(key, l),
        suffix: SUFFIX[key] ?? ` (${periodicityLabel(l.periodicity, l.interval_count, l.interval_unit).toLowerCase()})`,
        base: 0,
        tax: 0,
        total: 0,
        hasTax: false,
        listTotal: 0,
        discount: 0,
        surcharge: 0,
        count: 0,
      };
      groups.set(key, g);
    }
    const t = computeTax(l.amount_cents, l.tax_rate ?? null);
    g.base += t.base;
    g.tax += t.tax ?? 0;
    g.total += t.total;
    g.hasTax ||= t.tax !== null;
    g.count++;
    if (l.list_price_cents != null) {
      g.listTotal += l.list_price_cents;
      const diff = l.amount_cents - l.list_price_cents;
      if (diff < 0) g.discount += -diff;
      else g.surcharge += diff;
    }
    mrr += monthlyRecurringCents({
      billing_type: l.billing_type,
      periodicity: l.periodicity,
      interval_count: l.interval_count,
      interval_unit: l.interval_unit,
      amount_cents: l.amount_cents,
    });
  }

  const sorted = [...groups.values()].sort((a, b) => {
    const ia = ORDER.indexOf(a.key);
    const ib = ORDER.indexOf(b.key);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.key.localeCompare(b.key);
  });
  return { groups: sorted, mrr, arr: mrr * 12, variable, missingPrice };
}

/** Diferencia entre precio acordado y tarifa: null si no hay tarifa con la que comparar. */
export function priceDeviation(amount: Cents | null, list: Cents | null | undefined) {
  if (amount === null || list === null || list === undefined) return null;
  const diff = amount - list;
  const pct = list > 0 ? Math.round((diff / list) * 1000) / 10 : null;
  return { diff, pct };
}

/** Importe variable de un periodo: % de la base, redondeado al céntimo; nunca negativo. Null si falta la base. */
export function variableAmount(baseCents: Cents | null, rate: number): Cents | null {
  if (baseCents === null) return null;
  const rateBp = Math.round(rate * 100);
  const raw = (baseCents * rateBp) / 10_000;
  // round() de PostgreSQL redondea la mitad alejándose de cero.
  const rounded = raw >= 0 ? Math.floor(raw + 0.5) : -Math.floor(-raw + 0.5);
  return Math.max(rounded, 0);
}
