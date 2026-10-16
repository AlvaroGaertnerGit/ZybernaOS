import Link from "next/link";
import type { ContractDeliverableRow, ContractsViewRow } from "@/types/database";
import { computeTax, formatMoney } from "@/lib/calculations/money";
import { periodicityLabel } from "@/lib/calculations/mrr";
import { formatDate } from "@/lib/calculations/dates";
import { ContractStatusBadge } from "@/components/status-badges";
import { ContractQuickActions } from "./contract-quick-actions";

export function ContractCard({
  contract,
  deliverables,
}: {
  contract: ContractsViewRow;
  deliverables: Pick<ContractDeliverableRow, "id" | "title" | "description">[];
}) {
  const tax = computeTax(contract.amount_cents, contract.tax_rate);
  const recurring = contract.billing_type === "recurring";
  return (
    <article className="flex flex-col rounded-xl border border-border bg-surface shadow-xs transition-colors hover:border-border-strong">
      <header className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <p className="eyebrow mb-1">{contract.category_name}</p>
          <h3 className="truncate text-sm font-semibold">
            <Link href={`/contrataciones/${contract.id}`} className="outline-none hover:underline focus-visible:underline">
              {contract.name}
            </Link>
          </h3>
          <p className="text-xs text-subtle-foreground">{contract.code}</p>
        </div>
        <ContractStatusBadge status={contract.status} />
      </header>
      <div className="flex items-baseline gap-2 px-4 pt-3">
        <span className="tabular text-xl font-semibold tracking-tight">{formatMoney(contract.amount_cents, contract.currency)}</span>
        <span className="text-xs text-muted-foreground">
          {recurring ? periodicityLabel(contract.periodicity, contract.interval_count, contract.interval_unit).toLowerCase() : "pago único"}
        </span>
      </div>
      <p className="tabular px-4 pt-0.5 text-xs text-subtle-foreground">
        {recurring && contract.mrr_cents > 0 && `${formatMoney(contract.mrr_cents, contract.currency)} MRR`}
        {tax.tax !== null && `${recurring && contract.mrr_cents > 0 ? " · " : ""}Total con impuesto ${formatMoney(tax.total, contract.currency)}`}
      </p>
      {deliverables.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 border-t border-border px-4 py-3 text-sm">
          {deliverables.slice(0, 6).map((d) => (
            <li key={d.id} className="flex gap-2">
              <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-subtle-foreground" />
              <span className="text-muted-foreground">{d.title}</span>
            </li>
          ))}
          {deliverables.length > 6 && <li className="text-xs text-subtle-foreground">+{deliverables.length - 6} más</li>}
        </ul>
      )}
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span>
          Desde {formatDate(contract.start_date)}
          {contract.end_date && ` · hasta ${formatDate(contract.end_date)}`}
          {recurring && contract.next_renewal_date && ` · renueva ${formatDate(contract.next_renewal_date, "short")}`}
        </span>
        <ContractQuickActions contractId={contract.id} status={contract.status} name={contract.name} />
      </footer>
    </article>
  );
}
