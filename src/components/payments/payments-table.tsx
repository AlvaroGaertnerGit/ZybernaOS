"use client";

import Link from "next/link";
import { useState } from "react";
import { WalletIcon } from "lucide-react";
import type { PaymentsViewRow } from "@/types/database";
import { PAYMENT_STATUSES, PAYMENT_STATUS_META } from "@/lib/domain";
import { formatMoney } from "@/lib/calculations/money";
import { formatDate } from "@/lib/calculations/dates";
import { cn } from "@/lib/utils";
import { DataTable, type AppColumn } from "@/components/data-table/data-table";
import { FilterSelect, SearchInput, TableToolbar } from "@/components/data-table/toolbar";
import { useUrlState } from "@/components/data-table/use-url-state";
import { PaymentStatusBadge } from "@/components/status-badges";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PaymentActions } from "./payments-list";
import { RecordPaymentDialog, type PayablePayment } from "./record-payment-dialog";
import { PaymentHistoryDialog } from "./payment-history-dialog";

export function PaymentsTable({
  rows,
  total,
  page,
  pageSize,
  clients,
  filtered,
}: {
  rows: PaymentsViewRow[];
  total: number;
  page: number;
  pageSize: number;
  clients: { id: string; trade_name: string }[];
  filtered: boolean;
}) {
  const [paying, setPaying] = useState<PayablePayment | null>(null);
  const [history, setHistory] = useState<PaymentsViewRow | null>(null);

  const columns: AppColumn<PaymentsViewRow>[] = [
    {
      id: "concept",
      header: "Concepto",
      cell: ({ row }) => (
        <div className="flex min-w-48 flex-col">
          <span className="truncate font-medium">{row.original.concept}</span>
          <span className="text-xs text-subtle-foreground">
            {row.original.code}
            {row.original.invoice_ref && ` · Fra. ${row.original.invoice_ref}`}
          </span>
        </div>
      ),
    },
    {
      id: "client",
      header: "Cliente",
      cell: ({ row }) => (
        <Link href={`/clientes/${row.original.client_id}?tab=cobros`} className="hover:underline">
          {row.original.client_name}
        </Link>
      ),
    },
    {
      id: "due_date",
      header: "Vencimiento",
      cell: ({ row }) => (
        <span className={cn("whitespace-nowrap", row.original.status === "overdue" && "text-tone-danger-foreground")}>
          {formatDate(row.original.due_date)}
        </span>
      ),
    },
    { id: "status", header: "Estado", cell: ({ row }) => <PaymentStatusBadge status={row.original.status} /> },
    {
      id: "amount",
      header: "Previsto",
      meta: { align: "right" },
      cell: ({ row }) => formatMoney(row.original.amount_due_cents, row.original.currency),
    },
    {
      id: "paid",
      header: "Cobrado",
      meta: { align: "right", className: "hidden lg:table-cell" },
      cell: ({ row }) =>
        row.original.amount_paid_cents ? (
          <span>
            {formatMoney(row.original.amount_paid_cents, row.original.currency)}
            {row.original.last_paid_on && (
              <span className="block text-xs text-subtle-foreground">{formatDate(row.original.last_paid_on, "short")}</span>
            )}
          </span>
        ) : (
          <span className="text-subtle-foreground">—</span>
        ),
    },
    {
      id: "outstanding",
      header: "Pendiente",
      meta: { align: "right" },
      cell: ({ row }) =>
        row.original.amount_outstanding_cents && row.original.status !== "void" ? (
          <span className="font-medium">{formatMoney(row.original.amount_outstanding_cents, row.original.currency)}</span>
        ) : (
          <span className="text-subtle-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      meta: { align: "right" },
      cell: ({ row }) => (
        <div className="flex justify-end">
          <PaymentActions payment={row.original} onPay={() => setPaying(row.original)} onHistory={() => setHistory(row.original)} />
        </div>
      ),
    },
  ];

  return (
    <>
      <TableToolbar>
        <SearchInput placeholder="Buscar por concepto, cliente, código o factura" />
        <FilterSelect
          param="status"
          label="Estado"
          options={[
            { value: "pending,partial,overdue", label: "Pendientes de cobro" },
            ...PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_META[s].label })),
          ]}
        />
        <FilterSelect param="client" label="Cliente" options={clients.map((c) => ({ value: c.id, label: c.trade_name }))} />
        <DateRange />
      </TableToolbar>
      <DataTable
        caption="Cobros"
        columns={columns}
        data={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        getRowId={(r) => r.id}
        mobileCard={(p) => (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{p.concept}</p>
              <p className="truncate text-xs text-subtle-foreground">
                {p.client_name} · {formatDate(p.due_date, "short")}
              </p>
              <div className="mt-1.5">
                <PaymentStatusBadge status={p.status} />
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="tabular text-sm font-medium">{formatMoney(p.amount_outstanding_cents || p.amount_due_cents, p.currency)}</span>
              <PaymentActions payment={p} onPay={() => setPaying(p)} onHistory={() => setHistory(p)} />
            </div>
          </div>
        )}
        empty={
          <EmptyState
            icon={WalletIcon}
            title={filtered ? "Sin resultados" : "Todavía no hay cobros"}
            description={
              filtered
                ? "Ningún cobro coincide con los filtros."
                : "Crea un cobro previsto o genera los de una contratación recurrente desde su ficha."
            }
          />
        }
      />
      <RecordPaymentDialog payment={paying} open={paying !== null} onOpenChange={(o) => !o && setPaying(null)} />
      <PaymentHistoryDialog payment={history} open={history !== null} onOpenChange={(o) => !o && setHistory(null)} />
    </>
  );
}

function DateRange() {
  const url = useUrlState();
  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="date"
        aria-label="Vencimiento desde"
        value={url.get("from")}
        onChange={(e) => url.set({ from: e.target.value || null })}
        className="w-full sm:w-38"
      />
      <span className="text-xs text-subtle-foreground">–</span>
      <Input
        type="date"
        aria-label="Vencimiento hasta"
        value={url.get("to")}
        onChange={(e) => url.set({ to: e.target.value || null })}
        className="w-full sm:w-38"
      />
    </div>
  );
}
