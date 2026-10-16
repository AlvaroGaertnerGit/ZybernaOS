"use client";

import { useEffect, useState } from "react";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import type { PaymentsViewRow, TransactionRow } from "@/types/database";
import { formatMoney } from "@/lib/calculations/money";
import { formatDate } from "@/lib/calculations/dates";
import { deleteTransactionAction } from "@/server/actions/payments";
import { loadTransactionsAction } from "@/server/actions/payment-reads";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerAction } from "@/components/forms/use-action";

export function PaymentHistoryDialog({
  payment,
  open,
  onOpenChange,
}: {
  payment: PaymentsViewRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Historial de movimientos</DialogTitle>
          <DialogDescription>
            {payment ? `${payment.code} · ${payment.concept}` : ""}
          </DialogDescription>
        </DialogHeader>
        {payment && <History key={`${payment.id}-${payment.amount_paid_cents}`} payment={payment} />}
      </DialogContent>
    </Dialog>
  );
}

function History({ payment }: { payment: PaymentsViewRow }) {
  const [rows, setRows] = useState<TransactionRow[] | null>(null);
  const { run, pending } = useServerAction();

  useEffect(() => {
    let alive = true;
    loadTransactionsAction(payment.id).then((res) => {
      if (alive) setRows(res.ok ? res.data : []);
    });
    return () => {
      alive = false;
    };
  }, [payment.id]);

  if (rows === null) {
    return (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-label="Cargando" />
      </div>
    );
  }
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Sin movimientos registrados.</p>;

  return (
    <ul className="-mx-1 divide-y divide-border">
      {rows.map((t) => (
        <li key={t.id} className="flex items-center gap-3 px-1 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              {formatDate(t.paid_on)}
              {t.kind === "adjustment" && <span className="ml-2 text-xs text-subtle-foreground">Ajuste</span>}
            </p>
            <p className="truncate text-xs text-subtle-foreground">{[t.method, t.note].filter(Boolean).join(" · ") || "—"}</p>
          </div>
          <span className="tabular text-sm">{formatMoney(t.amount_cents, payment.currency)}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            aria-label="Eliminar movimiento"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => run(() => deleteTransactionAction(t.id), { onSuccess: () => setRows((r) => r?.filter((x) => x.id !== t.id) ?? null) })}
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
