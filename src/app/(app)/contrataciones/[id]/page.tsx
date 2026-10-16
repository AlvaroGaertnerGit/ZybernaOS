import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PencilIcon, WalletIcon } from "lucide-react";
import { getContract } from "@/server/queries/contracts";
import { computeTax, formatMoney } from "@/lib/calculations/money";
import { periodicityLabel } from "@/lib/calculations/mrr";
import { formatDate, todayIso } from "@/lib/calculations/dates";
import { PageHeader } from "@/components/layout/page-header";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Stat } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ContractStatusBadge } from "@/components/status-badges";
import { ContractQuickActions } from "@/components/contracts/contract-quick-actions";
import { PaymentsList } from "@/components/payments/payments-list";
import { NewPaymentButton } from "@/components/payments/new-payment-button";

export const metadata: Metadata = { title: "Contratación" };

export default async function ContractPage({ params }: PageProps<"/contrataciones/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { contract, deliverables, payments } = await getContract(id);
  if (!contract) notFound();

  const recurring = contract.billing_type === "recurring";
  const tax = computeTax(contract.amount_cents, contract.tax_rate);
  const collected = payments.reduce((a, p) => a + p.amount_paid_cents, 0);
  const outstanding = payments.filter((p) => p.status !== "void").reduce((a, p) => a + p.amount_outstanding_cents, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { href: "/clientes", label: "Clientes" },
          { href: `/clientes/${contract.client_id}?tab=servicios`, label: contract.client_name },
        ]}
        eyebrow={contract.category_name}
        title={contract.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ContractStatusBadge status={contract.status} />
            <span>{contract.code}</span>
            {contract.catalog_name && <span>· Plantilla: {contract.catalog_name}</span>}
          </span>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/contrataciones/${id}/editar`}>
                <PencilIcon aria-hidden="true" /> Editar
              </Link>
            </Button>
            <ContractQuickActions contractId={id} status={contract.status} name={contract.name} />
          </>
        }
      />

      <Panel>
        <PanelContent className="grid grid-cols-2 gap-6 p-5 lg:grid-cols-4">
          <Stat
            label={recurring ? "Precio por periodo" : "Precio"}
            value={formatMoney(contract.amount_cents, contract.currency)}
            hint={recurring ? periodicityLabel(contract.periodicity, contract.interval_count, contract.interval_unit) : "Pago único"}
          />
          <Stat
            label="MRR"
            value={recurring ? formatMoney(contract.mrr_cents, contract.currency) : "—"}
            hint={contract.status === "active" ? (recurring ? `ARR ${formatMoney(contract.mrr_cents * 12, contract.currency)}` : "No recurrente") : "No computa (no activa)"}
          />
          <Stat
            label="Impuesto"
            value={tax.tax === null ? "Sin configurar" : formatMoney(tax.total, contract.currency)}
            hint={tax.tax === null ? "Importes sin impuesto" : `${contract.tax_rate}% · ${formatMoney(tax.tax, contract.currency)}`}
          />
          <Stat label="Cobrado / pendiente" value={formatMoney(collected, contract.currency)} hint={`${formatMoney(outstanding, contract.currency)} pendiente`} />
        </PanelContent>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Panel>
            <PanelHeader>
              <PanelTitle>Prestaciones incluidas</PanelTitle>
              <Link href={`/contrataciones/${id}/editar`} className="text-xs text-muted-foreground hover:text-foreground">
                Editar
              </Link>
            </PanelHeader>
            {deliverables.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin prestaciones definidas.</p>
            ) : (
              <ol className="divide-y divide-border">
                {deliverables.map((d, i) => (
                  <li key={d.id} className="flex gap-3 px-4 py-2.5 text-sm">
                    <span className="tabular w-5 text-right text-xs leading-5 text-subtle-foreground">{i + 1}</span>
                    <span>
                      {d.title}
                      {d.description && <span className="block text-xs text-muted-foreground">{d.description}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          <Panel>
            <PanelHeader>
              <PanelTitle>Cobros</PanelTitle>
              <NewPaymentButton
                clientId={contract.client_id}
                clientName={contract.client_name}
                contracts={[{ id: contract.id, name: contract.name, amount_cents: contract.amount_cents, currency: contract.currency, tax_rate: contract.tax_rate }]}
                today={todayIso()}
                label="Cobro previsto"
              />
            </PanelHeader>
            {payments.length === 0 ? (
              <EmptyState
                icon={WalletIcon}
                title="Sin cobros"
                description={recurring ? "Usa «Generar cobros previstos» en el menú de acciones para crear las cuotas." : "Crea el cobro previsto de este proyecto."}
              />
            ) : (
              <PaymentsList payments={payments} />
            )}
          </Panel>
        </div>
        <Panel className="h-fit">
          <PanelHeader>
            <PanelTitle>Condiciones</PanelTitle>
          </PanelHeader>
          <PanelContent>
            <dl className="flex flex-col gap-3 text-sm">
              <Row label="Cliente" value={<Link href={`/clientes/${contract.client_id}`} className="hover:underline">{contract.client_name}</Link>} />
              <Row label="Inicio" value={formatDate(contract.start_date)} />
              <Row label="Finalización" value={formatDate(contract.end_date)} />
              {recurring && <Row label="Próxima renovación" value={formatDate(contract.next_renewal_date)} />}
              <Row label="Moneda" value={contract.currency} />
              <Row label="Responsable" value={contract.owner_name} />
              {contract.description && <Row label="Descripción" value={contract.description} />}
              {contract.notes && <Row label="Notas" value={<span className="whitespace-pre-wrap">{contract.notes}</span>} />}
            </dl>
          </PanelContent>
        </Panel>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value || <span className="text-subtle-foreground">—</span>}</dd>
    </div>
  );
}
