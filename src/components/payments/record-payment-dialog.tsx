"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { transactionSchema, type TransactionFormValues } from "@/lib/validations/schemas";
import { recordTransactionAction } from "@/server/actions/payments";
import { formatMoney } from "@/lib/calculations/money";
import { todayIso } from "@/lib/calculations/dates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useServerAction } from "@/components/forms/use-action";
import { newIdempotencyKey } from "@/components/forms/form-utils";

export interface PayablePayment {
  id: string;
  concept: string;
  client_name: string;
  amount_outstanding_cents: number;
  currency: string;
}

function centsToField(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Registro de un cobro total o parcial. La clave de idempotencia se crea al abrir el
 * diálogo: si se pulsa dos veces o se reintenta tras un fallo de red, no se duplica.
 */
export function RecordPaymentDialog({
  payment,
  open,
  onOpenChange,
}: {
  payment: PayablePayment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {payment && <RecordPaymentForm key={payment.id} payment={payment} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentForm({ payment, onDone }: { payment: PayablePayment; onDone: () => void }) {
  const [key] = useState(newIdempotencyKey);
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema) as never,
    defaultValues: {
      payment_id: payment.id,
      amount: centsToField(payment.amount_outstanding_cents),
      paid_on: todayIso(),
      method: "Transferencia",
      note: "",
      idempotency_key: key,
    },
  });
  const { run, pending } = useServerAction();
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(() => {
    run(() => recordTransactionAction(form.getValues()), { setError: form.setError, onSuccess: onDone });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Registrar cobro</DialogTitle>
        <DialogDescription>
          {payment.client_name} · {payment.concept}
        </DialogDescription>
      </DialogHeader>
      <p className="tabular rounded-lg bg-surface-sunken px-3 py-2 text-sm">
        Pendiente: <strong className="font-medium">{formatMoney(payment.amount_outstanding_cents, payment.currency)}</strong>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Importe cobrado" htmlFor="tx-amount" error={errors.amount?.message} required hint="Puedes registrar un pago parcial.">
          <Input {...form.register("amount")} inputMode="decimal" className="tabular" autoFocus />
        </Field>
        <Field label="Fecha de cobro" htmlFor="tx-paid_on" error={errors.paid_on?.message} required>
          <Input {...form.register("paid_on")} type="date" />
        </Field>
        <Field label="Método" htmlFor="tx-method" error={errors.method?.message}>
          <Input {...form.register("method")} list="payment-methods" />
        </Field>
        <Field label="Nota" htmlFor="tx-note" error={errors.note?.message}>
          <Input {...form.register("note")} />
        </Field>
      </div>
      <datalist id="payment-methods">
        <option value="Transferencia" />
        <option value="Domiciliación" />
        <option value="Tarjeta" />
        <option value="Bizum" />
        <option value="Efectivo" />
      </datalist>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending} data-testid="confirm-payment">
          {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          Registrar cobro
        </Button>
      </DialogFooter>
    </form>
  );
}
