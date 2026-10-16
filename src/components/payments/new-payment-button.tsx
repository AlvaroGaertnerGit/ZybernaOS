"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { paymentSchema, type PaymentFormValues } from "@/lib/validations/schemas";
import { createPaymentAction } from "@/server/actions/payments";
import { CURRENCIES } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useServerAction } from "@/components/forms/use-action";

export type ContractChoice = {
  id: string;
  name: string;
  amount_cents: number;
  currency: string;
  tax_rate: number | null;
  client_id?: string;
};

export function NewPaymentButton({
  clientId,
  clientName,
  clients,
  contracts,
  today,
  defaultOpen = false,
  label = "Nuevo cobro previsto",
}: {
  clientId?: string;
  clientName?: string;
  clients?: { id: string; trade_name: string; code: string }[];
  contracts: ContractChoice[];
  today: string;
  defaultOpen?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-testid="new-payment">
        <PlusIcon aria-hidden="true" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          {open && (
            <PaymentForm
              clientId={clientId}
              clientName={clientName}
              clients={clients}
              contracts={contracts}
              today={today}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function toField(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function PaymentForm({
  clientId,
  clientName,
  clients,
  contracts,
  today,
  onDone,
}: {
  clientId?: string;
  clientName?: string;
  clients?: { id: string; trade_name: string; code: string }[];
  contracts: ContractChoice[];
  today: string;
  onDone: () => void;
}) {
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema) as never,
    defaultValues: {
      client_id: clientId ?? "",
      client_service_id: "",
      concept: "",
      amount_due: "",
      tax_rate: "",
      currency: "EUR",
      due_date: today,
      invoice_ref: "",
      notes: "",
    },
  });
  const { run, pending } = useServerAction();
  const errors = form.formState.errors;
  const selectedClient = useWatch({ control: form.control, name: "client_id" });
  const available = contracts.filter((c) => !c.client_id || c.client_id === selectedClient);

  function pickContract(id: string) {
    form.setValue("client_service_id", id);
    const c = contracts.find((x) => x.id === id);
    if (!c) return;
    form.setValue("concept", c.name, { shouldValidate: true });
    form.setValue("amount_due", toField(c.amount_cents), { shouldValidate: true });
    form.setValue("currency", c.currency);
    form.setValue("tax_rate", c.tax_rate === null ? "" : String(c.tax_rate));
  }

  const onSubmit = form.handleSubmit(() => {
    run(() => createPaymentAction(form.getValues()), { setError: form.setError, onSuccess: onDone });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Nuevo cobro previsto</DialogTitle>
        <DialogDescription>{clientName ? clientName : "Registra un importe pendiente de cobro con su vencimiento."}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        {!clientId && clients && (
          <Field label="Cliente" htmlFor="pay-client" error={errors.client_id?.message} required className="sm:col-span-2">
            <NativeSelect
              {...form.register("client_id", { onChange: () => form.setValue("client_service_id", "") })}
            >
              <option value="" disabled>
                Elige un cliente…
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.trade_name} · {c.code}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
        <Field label="Contratación" htmlFor="pay-contract" error={errors.client_service_id?.message} className="sm:col-span-2" hint="Opcional. Rellena concepto e importe.">
          <NativeSelect value={useWatch({ control: form.control, name: "client_service_id" })} onChange={(e) => pickContract(e.target.value)} disabled={!selectedClient}>
            <option value="">Sin contratación asociada</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Concepto" htmlFor="pay-concept" error={errors.concept?.message} required className="sm:col-span-2">
          <Input {...form.register("concept")} placeholder="Ej. Cuota SEO · octubre" />
        </Field>
        <Field label="Importe previsto" htmlFor="pay-amount" error={errors.amount_due?.message} required hint="Base imponible.">
          <Input {...form.register("amount_due")} inputMode="decimal" className="tabular" />
        </Field>
        <Field label="Vencimiento" htmlFor="pay-due" error={errors.due_date?.message} required>
          <Input {...form.register("due_date")} type="date" />
        </Field>
        <Field label="Impuesto (%)" htmlFor="pay-tax" error={errors.tax_rate?.message} hint="Vacío = sin impuesto.">
          <Input {...form.register("tax_rate")} inputMode="decimal" className="tabular" />
        </Field>
        <Field label="Moneda" htmlFor="pay-currency" error={errors.currency?.message}>
          <NativeSelect {...form.register("currency")}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Referencia de factura" htmlFor="pay-invoice" error={errors.invoice_ref?.message}>
          <Input {...form.register("invoice_ref")} placeholder="Opcional" />
        </Field>
        <Field label="Notas" htmlFor="pay-notes" error={errors.notes?.message}>
          <Input {...form.register("notes")} />
        </Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending} data-testid="save-payment">
          {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          Crear cobro
        </Button>
      </DialogFooter>
    </form>
  );
}
