"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { UsersIcon } from "lucide-react";
import type { ClientsViewRow } from "@/types/database";
import { formatMoney } from "@/lib/calculations/money";
import { formatDate } from "@/lib/calculations/dates";
import { CLIENT_STATUSES, CLIENT_STATUS_META } from "@/lib/domain";
import { DataTable, type AppColumn } from "@/components/data-table/data-table";
import { FilterSelect, SearchInput, TableToolbar } from "@/components/data-table/toolbar";
import { ClientStatusBadge } from "@/components/status-badges";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ClientRowActions } from "./client-row-actions";

const columns: AppColumn<ClientsViewRow>[] = [
  {
    id: "trade_name",
    header: "Cliente",
    meta: { sortKey: "trade_name" },
    cell: ({ row }) => (
      <div className="flex min-w-48 flex-col">
        <Link
          href={`/clientes/${row.original.id}`}
          className="truncate font-medium outline-none hover:underline focus-visible:underline"
        >
          {row.original.trade_name}
        </Link>
        <span className="text-xs text-subtle-foreground">{row.original.code}</span>
      </div>
    ),
  },
  {
    id: "contact",
    header: "Contacto",
    cell: ({ row }) => (
      <div className="flex max-w-56 flex-col">
        <span className="truncate">{row.original.contact_name ?? "—"}</span>
        {row.original.email && <span className="truncate text-xs text-subtle-foreground">{row.original.email}</span>}
      </div>
    ),
  },
  { id: "status", header: "Estado", meta: { sortKey: "status" }, cell: ({ row }) => <ClientStatusBadge status={row.original.status} /> },
  {
    id: "owner",
    header: "Responsable",
    meta: { className: "hidden lg:table-cell" },
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.owner_name || "—"}</span>,
  },
  {
    id: "active_services",
    header: "Servicios",
    meta: { sortKey: "active_services", align: "right" },
    cell: ({ row }) => row.original.active_services,
  },
  {
    id: "mrr_cents",
    header: "MRR",
    meta: { sortKey: "mrr_cents", align: "right" },
    cell: ({ row }) => (row.original.mrr_cents ? formatMoney(row.original.mrr_cents) : <span className="text-subtle-foreground">—</span>),
  },
  {
    id: "joined_on",
    header: "Alta",
    meta: { sortKey: "joined_on", className: "hidden xl:table-cell" },
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.joined_on)}</span>,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Acciones</span>,
    meta: { align: "right" },
    cell: ({ row }) => <ClientRowActions id={row.original.id} archived={Boolean(row.original.archived_at)} name={row.original.trade_name} />,
  },
];

export function ClientsTable({
  rows,
  total,
  page,
  pageSize,
  members,
  filtered,
}: {
  rows: ClientsViewRow[];
  total: number;
  page: number;
  pageSize: number;
  members: { id: string; full_name: string; email: string }[];
  filtered: boolean;
}) {
  const router = useRouter();
  return (
    <>
      <TableToolbar>
        <SearchInput placeholder="Buscar por nombre, contacto, email o código" />
        <FilterSelect
          param="status"
          label="Estado"
          options={CLIENT_STATUSES.map((s) => ({ value: s, label: CLIENT_STATUS_META[s].label }))}
        />
        <FilterSelect
          param="owner"
          label="Responsable"
          options={[...members.map((m) => ({ value: m.id, label: m.full_name || m.email })), { value: "none", label: "Sin asignar" }]}
        />
        <FilterSelect param="archived" label="Vista" allLabel="Activos" options={[{ value: "1", label: "Archivados" }]} />
      </TableToolbar>
      <DataTable
        caption="Clientes"
        columns={columns}
        data={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        defaultSort="trade_name"
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`/clientes/${r.id}`)}
        mobileCard={(r) => (
          <Link
            href={`/clientes/${r.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors outline-none hover:bg-surface-sunken focus-visible:bg-surface-sunken"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-sm font-medium">{r.trade_name}</span>
              <span className="truncate text-xs text-subtle-foreground">
                {[r.contact_name, r.email].filter(Boolean).join(" · ") || r.code}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <ClientStatusBadge status={r.status} />
              {r.mrr_cents > 0 && <span className="tabular text-xs text-muted-foreground">{formatMoney(r.mrr_cents)}/mes</span>}
            </span>
          </Link>
        )}
        empty={
          filtered ? (
            <EmptyState icon={UsersIcon} title="Sin resultados" description="Ningún cliente coincide con los filtros." />
          ) : (
            <EmptyState icon={UsersIcon} title="Todavía no hay clientes" description="Crea el primero o impórtalos desde Excel.">
              <Button asChild size="sm">
                <Link href="/clientes/nuevo">Nuevo cliente</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/datos#importar">Importar Excel</Link>
              </Button>
            </EmptyState>
          )
        }
      />
    </>
  );
}
