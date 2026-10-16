import type { Cents } from "./money";
import type { BillingType, IntervalUnit, Periodicity } from "@/lib/domain";

export interface RecurringTerms {
  billing_type: BillingType;
  periodicity: Periodicity | null;
  interval_count: number | null;
  interval_unit: IntervalUnit | null;
  amount_cents: Cents;
}

/**
 * Normaliza el importe de una contratación a MRR (céntimos/mes, redondeo al céntimo).
 * Debe coincidir exactamente con public.mrr_cents() en la base de datos.
 *
 * - Mensual: importe.
 * - Trimestral: importe / 3. Semestral: / 6. Anual: / 12.
 * - Personalizado: cada N meses → /N; cada N años → /(12N);
 *   cada N semanas → ×52/(12N); cada N días → ×365/(12N).
 * - Pago único: 0 (no es ingreso recurrente).
 */
export function monthlyRecurringCents(t: RecurringTerms): Cents {
  if (t.billing_type !== "recurring" || !t.amount_cents) return 0;
  const a = t.amount_cents;
  switch (t.periodicity) {
    case "monthly":
      return a;
    case "quarterly":
      return roundHalfUp(a, 3);
    case "semiannual":
      return roundHalfUp(a, 6);
    case "annual":
      return roundHalfUp(a, 12);
    case "custom": {
      const n = t.interval_count ?? 0;
      if (n <= 0) return 0;
      switch (t.interval_unit) {
        case "month":
          return roundHalfUp(a, n);
        case "year":
          return roundHalfUp(a, 12 * n);
        case "week":
          return roundHalfUp(a * 52, 12 * n);
        case "day":
          return roundHalfUp(a * 365, 12 * n);
        default:
          return 0;
      }
    }
    default:
      return 0;
  }
}

/** División entera con redondeo half-up (igual que round() de numeric en PostgreSQL para positivos). */
function roundHalfUp(numerator: number, denominator: number): number {
  const q = Math.floor(numerator / denominator);
  const r = numerator - q * denominator;
  return 2 * r >= denominator ? q + 1 : q;
}

export function arrFromMrr(mrr: Cents): Cents {
  return mrr * 12;
}

export interface ContractForMrr extends RecurringTerms {
  status: string;
}

/** MRR total: solo contrataciones activas y recurrentes. */
export function totalMrr(contracts: readonly ContractForMrr[]): Cents {
  let total = 0;
  for (const c of contracts) {
    if (c.status === "active") total += monthlyRecurringCents(c);
  }
  return total;
}

/** Periodo en meses de una periodicidad (fraccional para semanas/días). Útil para textos. */
export function periodicityLabel(
  periodicity: Periodicity | null,
  count?: number | null,
  unit?: IntervalUnit | null,
): string {
  switch (periodicity) {
    case "monthly":
      return "Mensual";
    case "quarterly":
      return "Trimestral";
    case "semiannual":
      return "Semestral";
    case "annual":
      return "Anual";
    case "custom": {
      if (!count || !unit) return "Personalizado";
      const names: Record<IntervalUnit, [string, string]> = {
        day: ["día", "días"],
        week: ["semana", "semanas"],
        month: ["mes", "meses"],
        year: ["año", "años"],
      };
      const [one, many] = names[unit];
      return count === 1 ? `Cada ${one}` : `Cada ${count} ${many}`;
    }
    default:
      return "Pago único";
  }
}
