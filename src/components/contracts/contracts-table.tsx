"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileTextIcon } from "lucide-react";
import type { ContractsViewRow } from "@/types/database";
import { BILLING_TYPE_META, CONTRACT_STATUSES, CONTRACT_STATUS_META } from "@/lib/domain";
import { formatMoney } from "@/lib/calculations/money";
import { periodicityLabel } from "@/lib/calculations/mrr";
import { formatDate } from "@/lib/calculations/dates";
import { DataTable, type AppColumn } from "@/components/data-table/data-table";
import { FilterSelect, SearchInput, TableToolbar } from "@/components/data-table/toolbar";
import { ContractStatusBadge } from "@/components/status-badges";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ContractQuickActions } from "./contract-quick-actions";

const columns: AppColumn<ContractsViewRow>[] = [
  {
    id: "name",
    header: "Contratación",
    meta: { sortKey: "name" },
    cell: ({ row }) => (
      <div className="flex min-w-48 flex-col">
        <Link href={`/contrataciones/${row.original.id}`} className="truncate font-medium hover:underline">
          {row.original.name}
        </Link>
        <span className="text-xs text-subtle-foreground">
          {row.original.code} · {row.original.category_name}
        </span>
      </div>
    ),
  },
  {
    id: "client_name",
    header: "Cliente",
    meta: { sortKey: "client_name" },
    cell: ({ row }) => (
      <Link href={`/clientes/${row.original.client_id}`} className="hover:underline">
        {row.original.client_name}
      </Link>
    ),
  },
  { id: "status", header: "Estado", meta: { sortKey: "status" }, cell: ({ row }) => <ContractStatusBadge status={row.original.status} /> },
  {
    id: "billing",
    header: "Cobro",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.original.billing_type === "recurring"
          ? periodicityLabel(row.original.periodicity, row.original.interval_count, row.original.interval_unit)
          : "Pago único"}
      </span>
    ),
  },
  {
    id: "amount_cents",
    header: "Precio",
    meta: { sortKey: "amount_cents", align: "right" },
    cell: ({ row }) => formatMoney(row.original.amount_cents, row.original.currency),
  },
  {
    id: "mrr_cents",
    header: "MRR",
    meta: { sortKey: "mrr_cents", align: "right" },
    cell: ({ row }) =>
      row.original.mrr_cents && row.original.status === "active" ? (
        formatMoney(row.original.mrr_cents, row.original.currency)
      ) : (
        <span className="text-subtle-foreground">—</span>
      ),
  },
  {
    id: "next_renewal_date",
    header: "Renovación",
    meta: { sortKey: "next_renewal_date", className: "hidden xl:table-cell" },
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.next_renewal_date)}</span>,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Acciones</span>,
    meta: { align: "right" },
    cell: ({ row }) => <ContractQuickActions contractId={row.original.id} status={row.original.status} name={row.original.name} />,
  },
];

export function ContractsTable({
  rows,
  total,
  page,
  pageSize,
  categories,
  filtered,
}: {
  rows: ContractsViewRow[];
  total: number;
  page: number;
  pageSize: number;
  categories: { slug: string; name: string }[];
  filtered: boolean;
}) {
  const router = useRouter();
  return (
    <>
      <TableToolbar>
        <SearchInput placeholder="Buscar por servicio, cliente o código" />
        <FilterSelect param="status" label="Estado" options={CONTRACT_STATUSES.map((s) => ({ value: s, label: CONTRACT_STATUS_META[s].label }))} />
        <FilterSelect param="category" label="Categoría" allLabel="Todas" options={categories.map((c) => ({ value: c.slug, label: c.name }))} />
        <FilterSelect
          param="billing"
          label="Tipo"
          options={(["recurring", "one_time"] as const).map((b) => ({ value: b, label: BILLING_TYPE_META[b].label }))}
        />
      </TableToolbar>
      <DataTable
        caption="Contrataciones"
        columns={columns}
        data={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        defaultSort="start_date"
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`/contrataciones/${r.id}`)}
        mobileCard={(c) => (
          <Link href={`/contrataciones/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-sunken">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{c.name}</span>
              <span className="block truncate text-xs text-subtle-foreground">
                {c.client_name} · {c.category_name}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <ContractStatusBadge status={c.status} />
              <span className="tabular text-xs text-muted-foreground">{formatMoney(c.amount_cents, c.currency)}</span>
            </span>
          </Link>
        )}
        empty={
          <EmptyState
            icon={FileTextIcon}
            title={filtered ? "Sin resultados" : "Todavía no hay contrataciones"}
            description={filtered ? "Ninguna contratación coincide con los filtros." : "Registra el primer servicio contratado por un cliente."}
          >
            {!filtered && (
              <Button asChild size="sm">
                <Link href="/contrataciones/nueva">Nueva contratación</Link>
              </Button>
            )}
          </EmptyState>
        }
      />
    </>
  );
}
