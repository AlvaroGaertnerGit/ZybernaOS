import { VARIABLE_BASIS_META } from "@/lib/domain";
import { formatMoney, formatPercent } from "@/lib/calculations/money";
import type { EconomicSummary } from "@/lib/calculations/summary";
import { cn } from "@/lib/utils";

/**
 * Resumen económico de una selección: un bloque por periodicidad (pago único, mensual,
 * trimestral…), MRR equivalente y componentes variables. Nunca suma importes de
 * periodicidades distintas entre sí.
 */
export function EconomicSummaryPanel({
  summary,
  currency,
  className,
  empty = "Selecciona servicios para ver el resumen.",
}: {
  summary: EconomicSummary;
  currency: string;
  className?: string;
  empty?: string;
}) {
  const nothing = summary.groups.length === 0 && summary.variable.length === 0;
  return (
    <section
      aria-label="Resumen económico"
      aria-live="polite"
      className={cn("rounded-lg border border-border bg-surface-sunken/60 text-sm", className)}
    >
      <h3 className="eyebrow border-b border-border px-3 py-2">Resumen económico</h3>
      {nothing ? (
        <p className="px-3 py-3 text-xs text-subtle-foreground">{empty}</p>
      ) : (
        <dl className="divide-y divide-border">
          {summary.groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-0.5 px-3 py-2">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">
                  {g.label}
                  <span className="text-subtle-foreground"> · {g.count}</span>
                </dt>
                <dd className="tabular font-medium" data-testid={`summary-${g.key}`}>
                  {formatMoney(g.base, currency)}
                  {g.suffix}
                </dd>
              </div>
              {(g.discount > 0 || g.surcharge > 0) && (
                <p className="tabular flex flex-wrap justify-end gap-x-3 text-xs text-subtle-foreground">
                  <span>Tarifa {formatMoney(g.listTotal, currency)}</span>
                  {g.discount > 0 && <span className="text-tone-success-foreground">Descuento −{formatMoney(g.discount, currency)}</span>}
                  {g.surcharge > 0 && <span className="text-tone-warning-foreground">Suplemento +{formatMoney(g.surcharge, currency)}</span>}
                </p>
              )}
              {g.hasTax && (
                <p className="tabular text-right text-xs text-subtle-foreground">
                  Impuestos {formatMoney(g.tax, currency)} · Total {formatMoney(g.total, currency)}
                  {g.suffix}
                </p>
              )}
            </div>
          ))}
          {summary.variable.map((v, i) => (
            <div key={`v${i}`} className="flex items-baseline justify-between gap-3 px-3 py-2">
              <dt className="text-muted-foreground">Variable · {v.name}</dt>
              <dd className="text-right text-xs">
                {formatPercent(v.rate)} % {VARIABLE_BASIS_META[v.basis].of}
                <span className="block text-subtle-foreground">Pendiente: se calcula con la base de cada periodo</span>
              </dd>
            </div>
          ))}
          {summary.mrr > 0 && (
            <div className="tabular flex items-baseline justify-between gap-3 px-3 py-2">
              <dt className="text-muted-foreground">MRR equivalente</dt>
              <dd>
                <strong className="font-medium" data-testid="summary-mrr">
                  {formatMoney(summary.mrr, currency)}/mes
                </strong>
                <span className="ml-2 text-xs text-subtle-foreground">ARR {formatMoney(summary.arr, currency)}</span>
              </dd>
            </div>
          )}
        </dl>
      )}
      {summary.missingPrice.length > 0 && (
        <p className="border-t border-border px-3 py-2 text-xs text-tone-warning-foreground">
          Sin precio todavía (no computa): {summary.missingPrice.join(", ")}
        </p>
      )}
    </section>
  );
}
