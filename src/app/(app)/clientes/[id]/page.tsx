import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { FileTextIcon, PencilIcon, PlusIcon, WalletIcon } from "lucide-react";
import { getClient, getClientDetail } from "@/server/queries/clients";
import { getMembers } from "@/server/queries/common";
import { formatMoney } from "@/lib/calculations/money";
import { formatDate, todayIso } from "@/lib/calculations/dates";
import { PageHeader } from "@/components/layout/page-header";
import { TabNav } from "@/components/layout/tab-nav";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { ClientStatusBadge } from "@/components/status-badges";
import { ContractCard } from "@/components/contracts/contract-card";
import { PaymentsList } from "@/components/payments/payments-list";
import { NotesPanel } from "@/components/clients/notes-panel";
import { ActivityList } from "@/components/activity-list";
import { ClientRowActions } from "@/components/clients/client-row-actions";
import { NewPaymentButton } from "@/components/payments/new-payment-button";

const TABS = ["resumen", "servicios", "cobros", "notas", "actividad"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: PageProps<"/clientes/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return { title: "Cliente" };
  const client = await getClient(id);
  return { title: client?.trade_name ?? "Cliente" };
}

export default async function ClientPage({ params, searchParams }: PageProps<"/clientes/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "resumen";

  const [client, detail, members] = await Promise.all([getClient(id), getClientDetail(id), getMembers()]);
  if (!client) notFound();

  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name || m.email]));
  const today = todayIso();
  const activeContracts = detail.contracts.filter((c) => c.status === "active");
  const open = detail.payments.filter((p) => p.status === "pending" || p.status === "partial" || p.status === "overdue");
  const outstanding = open.reduce((a, p) => a + p.amount_outstanding_cents, 0);
  const overdue = open.filter((p) => p.status === "overdue").reduce((a, p) => a + p.amount_outstanding_cents, 0);
  const collected = detail.payments.reduce((a, p) => a + p.amount_paid_cents, 0);
  const delivByContract = new Map<string, typeof detail.deliverables>();
  for (const d of detail.deliverables) {
    delivByContract.set(d.client_service_id, [...(delivByContract.get(d.client_service_id) ?? []), d]);
  }
  const base = `/clientes/${id}`;
  const contractOptions = detail.contracts
    .filter((c) => c.status !== "cancelled")
    .map((c) => ({ id: c.id, name: c.name, amount_cents: c.amount_cents, currency: c.currency, tax_rate: c.tax_rate }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ href: "/clientes", label: "Clientes" }]}
        title={
          <span className="flex items-center gap-3">
            <span className="truncate">{client.trade_name}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ClientStatusBadge status={client.status} />
            <span>{client.code}</span>
            {client.archived_at && <span className="text-destructive">· Archivado</span>}
            {client.owner_name && <span>· Responsable: {client.owner_name}</span>}
          </span>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/editar`}>
                <PencilIcon aria-hidden="true" /> Editar
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/contrataciones/nueva?cliente=${id}`}>
                <PlusIcon aria-hidden="true" /> Contratación
              </Link>
            </Button>
            <ClientRowActions id={id} name={client.trade_name} archived={Boolean(client.archived_at)} />
          </>
        }
      />

      <TabNav
        label="Secciones del cliente"
        active={tab}
        tabs={[
          { id: "resumen", label: "Resumen", href: base },
          { id: "servicios", label: "Servicios", href: `${base}?tab=servicios`, count: detail.contracts.length },
          { id: "cobros", label: "Cobros", href: `${base}?tab=cobros`, count: detail.payments.length },
          { id: "notas", label: "Notas", href: `${base}?tab=notas`, count: detail.notes.length },
          { id: "actividad", label: "Actividad", href: `${base}?tab=actividad` },
        ]}
      />

      <div className="animate-fade-in">
        {tab === "resumen" && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-6 lg:col-span-2">
              <Panel>
                <PanelContent className="grid grid-cols-2 gap-6 p-5 sm:grid-cols-4">
                  <Stat label="MRR" value={formatMoney(client.mrr_cents)} hint={`ARR ${formatMoney(client.mrr_cents * 12)}`} />
                  <Stat label="Servicios activos" value={activeContracts.length} hint={`${detail.contracts.length} en total`} />
                  <Stat label="Pendiente" value={formatMoney(outstanding)} hint={overdue ? `${formatMoney(overdue)} vencido` : "Nada vencido"} />
                  <Stat label="Cobrado" value={formatMoney(collected)} hint="Histórico" />
                </PanelContent>
              </Panel>
              <Panel>
                <PanelHeader>
                  <PanelTitle>Servicios activos</PanelTitle>
                  <Link href={`${base}?tab=servicios`} className="text-xs text-muted-foreground hover:text-foreground">
                    Ver todos
                  </Link>
                </PanelHeader>
                {activeContracts.length === 0 ? (
                  <EmptyState icon={FileTextIcon} title="Sin servicios activos" description="Añade una contratación para empezar a calcular su MRR.">
                    <Button asChild size="sm">
                      <Link href={`/contrataciones/nueva?cliente=${id}`}>Nueva contratación</Link>
                    </Button>
                  </EmptyState>
                ) : (
                  <ul className="divide-y divide-border">
                    {activeContracts.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <Link href={`/contrataciones/${c.id}`} className="block truncate text-sm font-medium hover:underline">
                            {c.name}
                          </Link>
                          <p className="text-xs text-subtle-foreground">{c.category_name}</p>
                        </div>
                        <span className="tabular text-sm">
                          {c.billing_type === "recurring" ? `${formatMoney(c.mrr_cents, c.currency)}/mes` : formatMoney(c.amount_cents, c.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel>
                <PanelHeader>
                  <PanelTitle>Próximos vencimientos</PanelTitle>
                </PanelHeader>
                {open.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">No hay cobros pendientes.</p>
                ) : (
                  <PaymentsList payments={[...open].sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5)} />
                )}
              </Panel>
            </div>
            <Panel className="h-fit">
              <PanelHeader>
                <PanelTitle>Información</PanelTitle>
              </PanelHeader>
              <PanelContent>
                <dl className="flex flex-col gap-3.5 text-sm">
                  <Info label="Contacto" value={client.contact_name} />
                  <Info label="Email" value={client.email && <a href={`mailto:${client.email}`} className="hover:underline">{client.email}</a>} />
                  <Info label="Teléfono" value={client.phone && <a href={`tel:${client.phone}`} className="hover:underline">{client.phone}</a>} />
                  <Info
                    label="Web"
                    value={
                      client.website && (
                        <a href={client.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {client.website.replace(/^https?:\/\//, "")}
                        </a>
                      )
                    }
                  />
                  <Info label="Razón social" value={client.legal_name} />
                  <Info label="CIF / NIF" value={client.tax_id} />
                  <Info label="Sector" value={client.sector} />
                  <Info label="Dirección" value={client.address} />
                  <Info label="Fecha de alta" value={formatDate(client.joined_on)} />
                  {client.notes && <Info label="Notas" value={<span className="whitespace-pre-wrap">{client.notes}</span>} />}
                </dl>
              </PanelContent>
            </Panel>
          </div>
        )}

        {tab === "servicios" &&
          (detail.contracts.length === 0 ? (
            <Panel>
              <EmptyState icon={FileTextIcon} title="Sin contrataciones" description="Este cliente todavía no tiene servicios contratados.">
                <Button asChild size="sm">
                  <Link href={`/contrataciones/nueva?cliente=${id}`}>Nueva contratación</Link>
                </Button>
              </EmptyState>
            </Panel>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {detail.contracts.map((c) => (
                <ContractCard key={c.id} contract={c} deliverables={delivByContract.get(c.id) ?? []} />
              ))}
            </div>
          ))}

        {tab === "cobros" && (
          <Panel>
            <PanelHeader>
              <PanelTitle>Historial de cobros</PanelTitle>
              <NewPaymentButton clientId={id} clientName={client.trade_name} contracts={contractOptions} today={today} />
            </PanelHeader>
            {detail.payments.length === 0 ? (
              <EmptyState icon={WalletIcon} title="Sin cobros" description="Crea un cobro previsto o genera los de una contratación recurrente." />
            ) : (
              <PaymentsList payments={detail.payments} />
            )}
          </Panel>
        )}

        {tab === "notas" && (
          <Panel className="max-w-3xl">
            <PanelContent>
              <NotesPanel clientId={id} notes={detail.notes} authors={names} />
            </PanelContent>
          </Panel>
        )}

        {tab === "actividad" && (
          <Panel className="max-w-3xl">
            <ActivityList items={detail.activity} actors={names} />
          </Panel>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value || <span className="text-subtle-foreground">—</span>}</dd>
    </div>
  );
}
