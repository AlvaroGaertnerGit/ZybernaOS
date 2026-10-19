"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, PencilIcon, PlusIcon, ReceiptIcon, Trash2Icon } from "lucide-react";
import { VARIABLE_BASIS_META, type VariableBasis } from "@/lib/domain";
import { variablePeriodSchema, type VariablePeriodFormValues } from "@/lib/validations/schemas";
import { centsToField, formatMoney, formatPercent } from "@/lib/calculations/money";
import { formatDate } from "@/lib/calculations/dates";
import { variableAmount } from "@/lib/calculations/summary";
import { createVariablePaymentAction, deleteVariablePeriodAction, saveVariablePeriodAction } from "@/server/actions/contracts";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { useServerAction } from "@/components/forms/use-action";
import type { VariablePeriodRow } from "@/types/database";


/**
 * Componente variable por periodos: porcentaje × base (beneficios, ingresos o facturación).
 * Sin base, el periodo queda pendiente y no cuenta como ingreso. El cobro previsto se crea
 * solo cuando se pide expresamente.
 */
export function VariablePanel({
  contractId,
  rate,
  basis,
  currency,
  periods,
  today,
}: {
  contractId: string;
  rate: number;
  basis: VariableBasis;
  currency: string;
  periods: VariablePeriodRow[];
  today: string;
}) {
  const [editing, setEditing] = useState<VariablePeriodRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<VariablePeriodRow | null>(null);
  const [billing, setBilling] = useState<VariablePeriodRow | null>(null);
  const [due, setDue] = useState(today);
  const { run, pending } = useServerAction();

  return (
    <>
      <p className="px-4 pt-3 text-xs text-muted-foreground">
        {formatPercent(rate)} % {VARIABLE_BASIS_META[basis].of} de cada periodo. Los importes pendientes no computan como
        ingresos ni en el MRR.
      </p>
      {periods.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-muted-foreground">Sin periodos registrados.</p>
      ) : (
        <ul className="divide-y divide-border">
          {periods.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {formatDate(p.period_start)} – {formatDate(p.period_end)}
                </p>
                <p className="tabular text-xs text-subtle-foreground">
                  {p.base_amount_cents === null
                    ? `Base (${VARIABLE_BASIS_META[p.basis].label.toLowerCase()}) pendiente`
                    : `${VARIABLE_BASIS_META[p.basis].label}: ${formatMoney(p.base_amount_cents, currency)} × ${formatPercent(p.rate)} %`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {p.result_cents === null ? (
                  <StatusBadge tone="warning">Pendiente</StatusBadge>
                ) : (
                  <span className="tabular font-medium">{formatMoney(p.result_cents, currency)}</span>
                )}
                {p.payment_id ? (
                  <StatusBadge tone="success">Cobro previsto</StatusBadge>
                ) : (
                  <>
                    {p.result_cents !== null && p.result_cents > 0 && (
                      <Button type="button" variant="outline" size="xs" onClick={() => setBilling(p)}>
                        <ReceiptIcon aria-hidden="true" /> Crear cobro
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Editar periodo" onClick={() => setEditing(p)}>
                      <PencilIcon aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Eliminar periodo" onClick={() => setDeleting(p)}>
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="px-4 pb-4">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing("new")}>
          <PlusIcon aria-hidden="true" /> Registrar periodo
        </Button>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing !== null && (
            <PeriodForm
              contractId={contractId}
              period={editing === "new" ? null : editing}
              rate={rate}
              basis={basis}
              currency={currency}
              today={today}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="¿Eliminar este periodo?"
        description="Solo se eliminan periodos sin cobro previsto. No afecta a cobros ni a la contratación."
        confirmLabel="Eliminar"
        destructive
        pending={pending}
        onConfirm={() => deleting && run(() => deleteVariablePeriodAction(deleting.id, contractId), { onSuccess: () => setDeleting(null) })}
      />

      <Dialog open={billing !== null} onOpenChange={(o) => !o && setBilling(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear cobro previsto</DialogTitle>
            <DialogDescription>
              Se creará un cobro previsto de {billing?.result_cents != null ? formatMoney(billing.result_cents, currency) : "—"}. No se
              registra como cobrado hasta que anotes el pago.
            </DialogDescription>
          </DialogHeader>
          <Field label="Vencimiento" htmlFor="variable-due">
            <Input id="variable-due" type="date" value={due} onChange={(ev) => setDue(ev.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setBilling(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pending || !due}
              onClick={() => billing && run(() => createVariablePaymentAction(billing.id, contractId, due), { onSuccess: () => setBilling(null) })}
            >
              {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
              Crear cobro previsto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PeriodForm({
  contractId,
  period,
  rate,
  basis,
  currency,
  today,
  onDone,
}: {
  contractId: string;
  period: VariablePeriodRow | null;
  rate: number;
  basis: VariableBasis;
  currency: string;
  today: string;
  onDone: () => void;
}) {
  const monthStart = `${today.slice(0, 7)}-01`;
  const form = useForm<VariablePeriodFormValues>({
    resolver: zodResolver(variablePeriodSchema) as never,
    defaultValues: {
      contract_id: contractId,
      period_start: period?.period_start ?? monthStart,
      period_end: period?.period_end ?? today,
      base_amount: centsToField(period?.base_amount_cents),
      notes: period?.notes ?? "",
    },
  });
  const { run, pending } = useServerAction();
  const baseAmount = useWatch({ control: form.control, name: "base_amount" });
  const parsed = variablePeriodSchema.shape.base_amount.safeParse(baseAmount ?? "");
  const preview = parsed.success ? variableAmount(parsed.data, period?.rate ?? rate) : null;
  const e = form.formState.errors;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit(() =>
        run(() => saveVariablePeriodAction(period?.id ?? null, form.getValues()), { setError: form.setError, onSuccess: onDone }),
      )}
    >
      <DialogHeader>
        <DialogTitle>{period ? "Editar periodo" : "Registrar periodo"}</DialogTitle>
        <DialogDescription>
          {formatPercent(period?.rate ?? rate)} % {VARIABLE_BASIS_META[period?.basis ?? basis].of}. Deja la base vacía si aún no
          se conoce: el importe quedará pendiente.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde" htmlFor="vp-start" error={e.period_start?.message} required>
          <Input id="vp-start" type="date" {...form.register("period_start")} />
        </Field>
        <Field label="Hasta" htmlFor="vp-end" error={e.period_end?.message} required>
          <Input id="vp-end" type="date" {...form.register("period_end")} />
        </Field>
      </div>
      <Field
        label={`Importe de la base (${VARIABLE_BASIS_META[period?.basis ?? basis].label.toLowerCase()})`}
        htmlFor="vp-base"
        error={e.base_amount?.message}
        hint="Admite negativos (pérdidas): el variable no baja de 0."
      >
        <Input id="vp-base" {...form.register("base_amount")} inputMode="decimal" className="tabular" placeholder="Pendiente" />
      </Field>
      <p className="tabular rounded-lg bg-surface-sunken px-3 py-2 text-sm" aria-live="polite">
        Importe variable: <strong className="font-medium">{preview === null ? "pendiente" : formatMoney(preview, currency)}</strong>
      </p>
      <Field label="Notas" htmlFor="vp-notes" error={e.notes?.message}>
        <Input id="vp-notes" {...form.register("notes")} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}
