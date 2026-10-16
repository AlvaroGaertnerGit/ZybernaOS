import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { getDashboard } from "@/server/queries/dashboard";
import { param } from "@/server/queries/common";
import { requireMember } from "@/server/auth";
import { formatMoney } from "@/lib/calculations/money";
import { addMonths, formatDate, formatRelativeDays, startOfMonth, todayIso } from "@/lib/calculations/dates";
import { periodicityLabel } from "@/lib/calculations/mrr";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { PageHeader } from "@/components/layout/page-header";
import { ClientStatusBadge, PaymentStatusBadge } from "@/components/status-badges";
import { ActivityList } from "@/components/activity-list";
import { DistributionChart, MonthlyChart, MrrByCategoryChart } from "@/components/dashboard/lazy-charts";
import { MonthPicker } from "@/components/dashboard/month-picker";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const monthLabel = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const member = await requireMember();
  const sp = await searchParams;
  const today = todayIso();
  const months = Array.from({ length: 12 }, (_, i) => addMonths(startOfMonth(today), -i));
  const mesParam = param(sp, "mes");
  const selected = months.find((m) => m.slice(0, 7) === mesParam) ?? months[0];
  const d = await getDashboard(selected);
  const names = Object.fromEntries(d.activity.map((a) => [a.actor_id ?? "", a.actor]));
  const isCurrentMonth = selected === months[0];
  const periodName = monthLabel.format(new Date(`${selected}T00:00:00Z`));
  const firstName = member.fullName.split(" ")[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={formatDate(today)}
        title={firstName ? `Hola, ${firstName}` : "Dashboard"}
        description="Estado de la agencia: ingresos recurrentes, cobros reales y pendientes."
        actions={
          <MonthPicker
            value={selected}
            options={months.map((m) => ({ value: m, label: monthLabel.format(new Date(`${m}T00:00:00Z`)) }))}
          />
        }
      />

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-3 xl:grid-cols-6 [&>*]:bg-surface">
        <Kpi label="Clientes activos" value={String(d.kpis.activeClients)} href="/clientes?status=active" />
        <Kpi label="MRR" value={formatMoney(d.kpis.mrr)} hint="Ingresos recurrentes / mes" href="/contrataciones?status=active&billing=recurring" accent />
        <Kpi label="ARR" value={formatMoney(d.kpis.arr)} hint="MRR × 12" />
        <Kpi
          label={isCurrentMonth ? "Cobrado este mes" : `Cobrado en ${periodName}`}
          value={formatMoney(d.kpis.collectedInPeriod)}
          hint={`Previsto ${formatMoney(d.kpis.expectedInPeriod)}`}
          href="/cobros"
        />
        <Kpi
          label="Pendiente de cobro"
          value={formatMoney(d.kpis.pending.total)}
          hint={
            d.kpis.pending.overdue ? (
              <span className="text-tone-danger-foreground">{formatMoney(d.kpis.pending.overdue)} vencido</span>
            ) : (
              "Nada vencido"
            )
          }
          href="/cobros?status=pending%2Cpartial%2Coverdue"
        />
        <Kpi label="Servicios activos" value={String(d.kpis.activeContracts)} href="/contrataciones?status=active" />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader>
            <div>
              <PanelTitle>Cobros mensuales</PanelTitle>
              <PanelDescription>Cobrado real frente a facturación prevista · últimos 12 meses</PanelDescription>
            </div>
            <Legend items={[{ label: "Cobrado", color: "bg-chart-1" }, { label: "Previsto", color: "bg-chart-6/45" }]} />
          </PanelHeader>
          <div className="h-64 p-3 pr-4">
            <MonthlyChart data={d.series} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader>
            <div>
              <PanelTitle>Distribución de servicios</PanelTitle>
              <PanelDescription>Contrataciones activas por categoría</PanelDescription>
            </div>
          </PanelHeader>
          <div className="h-64 p-4">
            {d.distribution.length ? <DistributionChart data={d.distribution} /> : <ChartEmpty text="Sin servicios activos" />}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Panel>
          <PanelHeader>
            <div>
              <PanelTitle>MRR por categoría</PanelTitle>
              <PanelDescription>Solo contrataciones recurrentes activas</PanelDescription>
            </div>
          </PanelHeader>
          <div className="h-56 p-3">
            {d.mrrByCategory.length ? <MrrByCategoryChart data={d.mrrByCategory} /> : <ChartEmpty text="Sin ingresos recurrentes" />}
          </div>
        </Panel>

        <ListPanel title="Pagos atrasados" href="/cobros?status=overdue" empty="Ningún pago atrasado.">
          {d.overdue.map((p) => (
            <Row
              key={p.id}
              href={`/clientes/${p.client_id}?tab=cobros`}
              title={p.client_name}
              subtitle={`${p.concept} · venció ${formatRelativeDays(p.due_date, d.today)}`}
              right={<span className="text-tone-danger-foreground">{formatMoney(p.amount_outstanding_cents, p.currency)}</span>}
            />
          ))}
        </ListPanel>

        <ListPanel title="Próximos vencimientos" description="30 días" href="/cobros?status=pending%2Cpartial" empty="Sin vencimientos próximos.">
          {d.upcoming.map((p) => (
            <Row
              key={p.id}
              href={`/clientes/${p.client_id}?tab=cobros`}
              title={p.client_name}
              subtitle={`${p.concept} · ${formatRelativeDays(p.due_date, d.today)}`}
              right={
                <span className="flex flex-col items-end gap-1">
                  {formatMoney(p.amount_outstanding_cents, p.currency)}
                  {p.status === "partial" && <PaymentStatusBadge status="partial" />}
                </span>
              }
            />
          ))}
        </ListPanel>

        <ListPanel title="Renovaciones próximas" description="45 días" href="/contrataciones?status=active&sort=next_renewal_date&dir=asc" empty="Sin renovaciones próximas.">
          {d.renewals.map((c) => (
            <Row
              key={c.id}
              href={`/contrataciones/${c.id}`}
              title={c.client_name}
              subtitle={`${c.name} · ${formatDate(c.next_renewal_date, "short")}`}
              right={
                <span className="flex flex-col items-end">
                  {formatMoney(c.amount_cents, c.currency)}
                  <span className="text-xs text-subtle-foreground">{periodicityLabel(c.periodicity, c.interval_count, c.interval_unit)}</span>
                </span>
              }
            />
          ))}
        </ListPanel>

        <ListPanel title="Últimos clientes" href="/clientes?sort=joined_on&dir=desc" empty="Todavía no hay clientes.">
          {d.recentClients.map((c) => (
            <Row
              key={c.id}
              href={`/clientes/${c.id}`}
              title={c.trade_name}
              subtitle={`Alta ${formatDate(c.joined_on, "short")}`}
              right={
                <span className="flex flex-col items-end gap-1">
                  <ClientStatusBadge status={c.status} />
                  {c.mrr_cents > 0 && <span className="text-xs text-subtle-foreground">{formatMoney(c.mrr_cents)}/mes</span>}
                </span>
              }
            />
          ))}
        </ListPanel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Actividad reciente</PanelTitle>
          </PanelHeader>
          <div className="py-1">
            <ActivityList items={d.activity} actors={names} linkClients />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  href,
  accent,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  href?: string;
  accent?: boolean;
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {label}
        {href && (
          <ArrowUpRightIcon
            className="size-3.5 opacity-0 transition-opacity duration-(--motion-duration-fast) group-hover/kpi:opacity-100"
            aria-hidden="true"
          />
        )}
      </span>
      <span className={cn("tabular mt-2 truncate text-2xl font-semibold tracking-tight", accent && "text-primary")}>{value}</span>
      {hint && <span className="mt-1 truncate text-xs text-subtle-foreground">{hint}</span>}
    </>
  );
  const cls = "group/kpi flex min-w-0 flex-col p-4 sm:p-5";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors outline-none hover:bg-surface-sunken focus-visible:bg-surface-sunken")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function ListPanel({
  title,
  description,
  href,
  empty,
  children,
}: {
  title: string;
  description?: string;
  href: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <Panel className="flex flex-col">
      <PanelHeader>
        <div className="flex items-baseline gap-2">
          <PanelTitle>{title}</PanelTitle>
          {description && <span className="text-xs text-subtle-foreground">{description}</span>}
        </div>
        <Link href={href} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
          Ver todo
        </Link>
      </PanelHeader>
      {children.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 py-8 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">{children}</ul>
      )}
    </Panel>
  );
}

function Row({ href, title, subtitle, right }: { href: string; title: string; subtitle: string; right: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors outline-none hover:bg-surface-sunken focus-visible:bg-surface-sunken"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block truncate text-xs text-subtle-foreground">{subtitle}</span>
        </span>
        <span className="tabular shrink-0 text-right text-sm">{right}</span>
      </Link>
    </li>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-sm", i.color)} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function ChartEmpty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{text}</div>;
}
