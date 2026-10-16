"use client";

import Link from "next/link";
import { useState } from "react";
import { BanIcon, CircleDollarSignIcon, MoreHorizontalIcon, RotateCcwIcon } from "lucide-react";
import type { PaymentsViewRow } from "@/types/database";
import { formatMoney } from "@/lib/calculations/money";
import { formatDate } from "@/lib/calculations/dates";
import { setPaymentVoidAction } from "@/server/actions/payments";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PaymentStatusBadge } from "@/components/status-badges";
import { useServerAction } from "@/components/forms/use-action";
import { RecordPaymentDialog, type PayablePayment } from "./record-payment-dialog";
import { PaymentHistoryDialog } from "./payment-history-dialog";

/** Lista compacta de cobros (ficha de cliente / contratación) con acciones de registro. */
export function PaymentsList({ payments, showClient = false }: { payments: PaymentsViewRow[]; showClient?: boolean }) {
  const [paying, setPaying] = useState<PayablePayment | null>(null);
  const [history, setHistory] = useState<PaymentsViewRow | null>(null);

  return (
    <>
      <ul className="divide-y divide-border">
        {payments.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.concept}</p>
              <p className="truncate text-xs text-subtle-foreground">
                {p.code} · vence {formatDate(p.due_date)}
                {showClient && (
                  <>
                    {" · "}
                    <Link href={`/clientes/${p.client_id}`} className="hover:underline">
                      {p.client_name}
                    </Link>
                  </>
                )}
                {p.invoice_ref && ` · Factura ${p.invoice_ref}`}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <PaymentStatusBadge status={p.status} />
              <div className="tabular w-32 text-right text-sm">
                <p className={cn(p.status === "void" && "text-subtle-foreground line-through")}>
                  {formatMoney(p.amount_due_cents, p.currency)}
                </p>
                {p.amount_paid_cents > 0 && p.amount_outstanding_cents > 0 && (
                  <p className="text-xs text-subtle-foreground">pendiente {formatMoney(p.amount_outstanding_cents, p.currency)}</p>
                )}
              </div>
              <PaymentActions payment={p} onPay={() => setPaying(p)} onHistory={() => setHistory(p)} />
            </div>
          </li>
        ))}
      </ul>
      <RecordPaymentDialog payment={paying} open={paying !== null} onOpenChange={(o) => !o && setPaying(null)} />
      <PaymentHistoryDialog payment={history} open={history !== null} onOpenChange={(o) => !o && setHistory(null)} />
    </>
  );
}

export function PaymentActions({
  payment,
  onPay,
  onHistory,
}: {
  payment: PaymentsViewRow;
  onPay: () => void;
  onHistory: () => void;
}) {
  const { run } = useServerAction();
  const payable = payment.status !== "void" && payment.amount_outstanding_cents > 0;
  return (
    <div className="flex items-center gap-1">
      {payable && (
        <Button size="sm" variant="outline" onClick={onPay} data-testid="record-payment">
          Cobrar
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Más acciones de ${payment.concept}`}>
            <MoreHorizontalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={onHistory}>
            <CircleDollarSignIcon aria-hidden="true" /> Historial de movimientos
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {payment.status === "void" ? (
            <DropdownMenuItem onSelect={() => run(() => setPaymentVoidAction(payment.id, false))}>
              <RotateCcwIcon aria-hidden="true" /> Reactivar
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={payment.amount_paid_cents > 0}
              onSelect={() => run(() => setPaymentVoidAction(payment.id, true))}
            >
              <BanIcon aria-hidden="true" /> Anular
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
