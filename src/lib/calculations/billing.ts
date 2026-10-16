import { addDays, addMonths, type IsoDate } from "./dates";
import type { BillingType, IntervalUnit, Periodicity } from "@/lib/domain";
import type { Cents } from "./money";

export interface ScheduleTerms {
  billing_type: BillingType;
  periodicity: Periodicity | null;
  interval_count: number | null;
  interval_unit: IntervalUnit | null;
  start_date: IsoDate;
  end_date: IsoDate | null;
}

/** Devuelve la fecha de inicio del periodo n (0 = primer periodo) a partir de la fecha ancla. */
export function periodStart(terms: ScheduleTerms, n: number): IsoDate | null {
  if (terms.billing_type !== "recurring") return n === 0 ? terms.start_date : null;
  switch (terms.periodicity) {
    case "monthly":
      return addMonths(terms.start_date, n);
    case "quarterly":
      return addMonths(terms.start_date, 3 * n);
    case "semiannual":
      return addMonths(terms.start_date, 6 * n);
    case "annual":
      return addMonths(terms.start_date, 12 * n);
    case "custom": {
      const c = terms.interval_count ?? 0;
      if (c <= 0 || !terms.interval_unit) return null;
      switch (terms.interval_unit) {
        case "day":
          return addDays(terms.start_date, c * n);
        case "week":
          return addDays(terms.start_date, 7 * c * n);
        case "month":
          return addMonths(terms.start_date, c * n);
        case "year":
          return addMonths(terms.start_date, 12 * c * n);
      }
    }
    // falls through
    default:
      return null;
  }
}

/** Siguiente renovación tras `after` (exclusivo). null para pagos únicos o si ha terminado. */
export function nextRenewal(terms: ScheduleTerms, after: IsoDate): IsoDate | null {
  if (terms.billing_type !== "recurring") return null;
  for (let n = 1; n < 10_000; n++) {
    const d = periodStart(terms, n);
    if (!d) return null;
    if (terms.end_date && d > terms.end_date) return null;
    if (d > after) return d;
  }
  return null;
}

export type PlannedPayment = {
  period_start: IsoDate;
  due_date: IsoDate;
  concept: string;
}

/**
 * Calcula los periodos de cobro pendientes de generar, de forma acotada:
 * desde el inicio del contrato hasta `until` (incluido), saltando los periodos ya
 * existentes y con un máximo de `limit` resultados. No genera cientos de cobros:
 * la generación es explícita, idempotente (único por contratación + periodo) y limitada.
 */
export function planPayments(
  terms: ScheduleTerms & { name: string },
  opts: { until: IsoDate; existingPeriods: ReadonlySet<IsoDate>; limit?: number; dueOffsetDays?: number },
): PlannedPayment[] {
  const limit = Math.min(opts.limit ?? 12, 24);
  const out: PlannedPayment[] = [];
  const maxIter = terms.billing_type === "recurring" ? 2_000 : 1;
  for (let n = 0; n < maxIter && out.length < limit; n++) {
    const start = periodStart(terms, n);
    if (!start) break;
    if (start > opts.until) break;
    if (terms.end_date && start > terms.end_date) break;
    if (opts.existingPeriods.has(start)) continue;
    out.push({
      period_start: start,
      due_date: addDays(start, opts.dueOffsetDays ?? 0),
      concept: periodConcept(terms.name, start, terms),
    });
  }
  return out;
}

const monthYear = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

function periodConcept(name: string, start: IsoDate, terms: ScheduleTerms): string {
  if (terms.billing_type !== "recurring") return name;
  const label = monthYear.format(new Date(`${start}T00:00:00Z`));
  return `${name} · ${label}`;
}

/** Importe por defecto de un cobro generado a partir de la contratación. */
export function scheduledAmount(amount_cents: Cents): Cents {
  return amount_cents;
}
