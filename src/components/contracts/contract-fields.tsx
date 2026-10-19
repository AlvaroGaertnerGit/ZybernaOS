"use client";

import { useState } from "react";
import { useFormContext, useWatch, type FieldValues } from "react-hook-form";
import { PercentIcon, PlusIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import {
  BILLING_TYPE_META,
  CONTRACT_STATUSES,
  CONTRACT_STATUS_META,
  CURRENCIES,
  INTERVAL_UNITS,
  INTERVAL_UNIT_META,
  PERIODICITIES,
  PERIODICITY_META,
  VARIABLE_BASES,
  VARIABLE_BASIS_META,
  type BillingType,
  type IntervalUnit,
  type Periodicity,
} from "@/lib/domain";
import { computeTax, formatMoney, formatPercent, parseMoneyToCents } from "@/lib/calculations/money";
import { monthlyRecurringCents } from "@/lib/calculations/mrr";
import { nextRenewal } from "@/lib/calculations/billing";
import { isIsoDate, todayIso } from "@/lib/calculations/dates";
import { priceDeviation } from "@/lib/calculations/summary";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DeliverablesEditor } from "@/components/forms/deliverables-editor";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { errorAt, type CategoryOption, type MemberOption } from "@/components/forms/form-utils";
import {
  centsToField,
  findModality,
  isCustomized,
  modalitiesOf,
  modalityKey,
  type CatalogOption,
  type Modality,
} from "./catalog-option";

type Pending = { kind: "service"; id: string } | { kind: "modality"; modality: Modality };

/** Campos de una contratación (precio, cobro, fechas, prestaciones). */
export function ContractFields({
  prefix = "",
  categories,
  catalog,
  members,
  showCatalogPicker = true,
  compact = false,
  ruleWarnings = [],
}: {
  prefix?: string;
  categories: CategoryOption[];
  catalog: CatalogOption[];
  members: MemberOption[];
  showCatalogPicker?: boolean;
  compact?: boolean;
  /** Incompatibilidades con otras contrataciones del cliente (se calculan fuera). */
  ruleWarnings?: string[];
}) {
  const { register, formState, setValue, getValues, control } = useFormContext<FieldValues>();
  const n = (k: string) => `${prefix}${k}`;
  const e = (k: string) => errorAt(formState.errors, n(k));
  const id = (k: string) => `contract-${prefix.replace(/\W/g, "")}${k}`;
  const [pending, setPending] = useState<Pending | null>(null);

  const [billingType, periodicity, amount, currency, taxRate, count, unit, startDate, serviceId, categoryId, variableRate, variableBasis] =
    useWatch({
      control,
      name: [
        n("billing_type"),
        n("periodicity"),
        n("amount"),
        n("currency"),
        n("tax_rate"),
        n("interval_count"),
        n("interval_unit"),
        n("start_date"),
        n("service_id"),
        n("category_id"),
        n("variable_rate"),
        n("variable_basis"),
      ],
    }) as string[];
  const [showVariable, setShowVariable] = useState(Boolean(variableRate || variableBasis));

  const recurring = billingType === "recurring";
  const cents = parseMoneyToCents(amount ?? "");
  const mrr =
    cents !== null && recurring
      ? monthlyRecurringCents({
          billing_type: "recurring",
          periodicity: (periodicity || null) as Periodicity | null,
          interval_count: count ? Number(count) : null,
          interval_unit: (unit || null) as IntervalUnit | null,
          amount_cents: cents,
        })
      : 0;
  const taxNum = taxRate ? Number(String(taxRate).replace(",", ".")) : null;
  const tax = cents !== null && taxNum !== null && Number.isFinite(taxNum) ? computeTax(cents, taxNum) : null;
  const selected = catalog.find((c) => c.id === serviceId);
  const modalities = selected ? modalitiesOf(selected) : [];
  const currentModality = selected ? findModality(selected, billingType, recurring ? periodicity : null) : undefined;
  const listPrice = currentModality?.price_cents ?? null;
  const deviation = priceDeviation(amount?.trim() ? cents : null, listPrice);

  /** Valores actuales de esta contratación, para saber si se han personalizado. */
  function currentValues() {
    const src = (prefix ? getValues(prefix.replace(/\.$/, "")) : getValues()) as Record<string, unknown>;
    return {
      amount: String(src.amount ?? ""),
      billing_type: String(src.billing_type ?? "recurring") as BillingType,
      periodicity: String(src.periodicity ?? "") as Periodicity | "",
      name: String(src.name ?? ""),
      deliverables: (src.deliverables as { title: string; description: string }[]) ?? [],
    };
  }

  function applyCatalog(idValue: string) {
    setValue(n("service_id"), idValue, { shouldDirty: true, shouldValidate: true });
    const svc = catalog.find((c) => c.id === idValue);
    if (!svc) return;
    setValue(n("category_id"), svc.category_id, { shouldDirty: true });
    setValue(n("name"), svc.name, { shouldDirty: true, shouldValidate: true });
    setValue(n("description"), svc.description ?? "");
    setValue(n("billing_type"), svc.suggested_billing_type);
    setValue(n("periodicity"), svc.suggested_periodicity ?? "");
    setValue(n("amount"), centsToField(svc.default_price_cents), { shouldValidate: formState.isSubmitted });
    setValue(
      n("deliverables"),
      svc.deliverables.map((d) => ({ title: d.title, description: d.description ?? "" })),
    );
  }

  function requestCatalog(idValue: string) {
    if (idValue === serviceId) return;
    if (selected && isCustomized(currentValues(), selected)) setPending({ kind: "service", id: idValue });
    else applyCatalog(idValue);
  }

  function applyModality(m: Modality) {
    setValue(n("billing_type"), m.billing_type, { shouldDirty: true });
    setValue(n("periodicity"), m.periodicity ?? "", { shouldDirty: true });
    // Tarifa específica de la modalidad; sin tarifa definida no se inventa un importe.
    setValue(n("amount"), centsToField(m.price_cents), { shouldDirty: true, shouldValidate: formState.isSubmitted });
  }

  function requestModality(m: Modality) {
    const priceChanged = amount?.trim() && cents !== listPrice;
    if (priceChanged) setPending({ kind: "modality", modality: m });
    else applyModality(m);
  }

  function suggestRenewal() {
    if (!isIsoDate(startDate ?? "")) return;
    const next = nextRenewal(
      {
        billing_type: billingType as BillingType,
        periodicity: (periodicity || null) as Periodicity | null,
        interval_count: count ? Number(count) : null,
        interval_unit: (unit || null) as IntervalUnit | null,
        start_date: startDate,
        end_date: null,
      },
      todayIso() > startDate ? todayIso() : startDate,
    );
    if (next) setValue(n("next_renewal_date"), next, { shouldDirty: true });
  }

  function removeVariable() {
    setValue(n("variable_rate"), "", { shouldDirty: true, shouldValidate: formState.isSubmitted });
    setValue(n("variable_basis"), "", { shouldDirty: true, shouldValidate: formState.isSubmitted });
    setShowVariable(false);
  }

  const activeCategories = categories.filter((c) => c.is_active || c.id === categoryId);
  const pendingService = pending?.kind === "service" ? catalog.find((c) => c.id === pending.id) : undefined;

  return (
    <div className="flex flex-col gap-5">
      {showCatalogPicker && (
        <Field
          label="Servicio del catálogo"
          htmlFor={id("service_id")}
          error={e("service_id")}
          hint="Carga la tarifa, la periodicidad y las prestaciones del catálogo. Todo es editable para este cliente."
        >
          <NativeSelect id={id("service_id")} value={serviceId ?? ""} onChange={(ev) => requestCatalog(ev.target.value)}>
            <option value="">Personalizado (sin plantilla)</option>
            {categories.map((cat) => {
              const items = catalog.filter((c) => c.category_id === cat.id && (c.status === "active" || c.id === serviceId));
              if (!items.length) return null;
              return (
                <optgroup key={cat.id} label={cat.name}>
                  {items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.default_price_cents != null ? ` · ${formatMoney(c.default_price_cents, c.currency)}` : ""}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </NativeSelect>
        </Field>
      )}

      {ruleWarnings.length > 0 && (
        <div role="alert" className="flex gap-2 rounded-lg bg-tone-warning px-3 py-2 text-sm text-tone-warning-foreground">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <ul className="flex flex-col gap-1">
            {ruleWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-6">
        <Field label="Nombre de la contratación" htmlFor={id("name")} error={e("name")} required className="sm:col-span-4">
          <Input {...register(n("name"))} placeholder="Ej. Gestión SEO" />
        </Field>
        <Field label="Categoría" htmlFor={id("category_id")} error={e("category_id")} required className="sm:col-span-2">
          <NativeSelect {...register(n("category_id"))}>
            <option value="" disabled>
              Elige…
            </option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      {modalities.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Modalidad</legend>
          <div
            className="flex flex-wrap gap-1 rounded-lg bg-surface-sunken p-1 sm:w-fit"
            role="radiogroup"
            aria-label="Modalidad de contratación"
          >
            {modalities.map((m) => {
              const key = modalityKey(m);
              const checked = currentModality !== undefined && modalityKey(currentModality) === key;
              return (
                <label
                  key={key}
                  className={cn(
                    "flex min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    checked && "bg-surface font-medium text-foreground shadow-xs",
                  )}
                >
                  <input type="radio" className="sr-only" checked={checked} onChange={() => requestModality(m)} />
                  {m.billing_type === "one_time" ? BILLING_TYPE_META.one_time.label : PERIODICITY_META[m.periodicity ?? "monthly"].label}
                  <span className="tabular text-xs text-subtle-foreground">
                    {m.price_cents != null ? formatMoney(m.price_cents, selected?.currency ?? "EUR") : "a medida"}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Tipo de cobro</legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-sunken p-1 sm:max-w-sm" role="radiogroup">
            {(["recurring", "one_time"] as const).map((t) => (
              <label
                key={t}
                className={cn(
                  "flex h-8 cursor-pointer items-center justify-center rounded-md text-sm text-muted-foreground transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                  billingType === t && "bg-surface font-medium text-foreground shadow-xs",
                )}
              >
                <input type="radio" value={t} {...register(n("billing_type"))} className="sr-only" />
                {BILLING_TYPE_META[t].label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-6">
        <Field
          label={recurring ? "Precio por periodo" : "Precio"}
          htmlFor={id("amount")}
          error={e("amount")}
          required
          hint="Base imponible, sin impuestos."
          className="sm:col-span-2"
        >
          <Input {...register(n("amount"))} inputMode="decimal" placeholder="0,00" className="tabular" />
        </Field>
        <Field label="Moneda" htmlFor={id("currency")} error={e("currency")} className="sm:col-span-1">
          <NativeSelect {...register(n("currency"))}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Impuesto (%)" htmlFor={id("tax_rate")} error={e("tax_rate")} hint="Vacío = sin impuesto." className="sm:col-span-1">
          <Input {...register(n("tax_rate"))} inputMode="decimal" placeholder="—" className="tabular" />
        </Field>
        {recurring && (
          <Field label="Periodicidad" htmlFor={id("periodicity")} error={e("periodicity")} required className="sm:col-span-2">
            <NativeSelect {...register(n("periodicity"))}>
              <option value="" disabled>
                Elige…
              </option>
              {PERIODICITIES.map((p) => (
                <option key={p} value={p}>
                  {PERIODICITY_META[p].label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
        {recurring && periodicity === "custom" && (
          <div className="grid grid-cols-2 gap-3 sm:col-span-6 sm:max-w-sm">
            <Field label="Cada" htmlFor={id("interval_count")} error={e("interval_count")} required>
              <Input {...register(n("interval_count"))} inputMode="numeric" placeholder="2" className="tabular" />
            </Field>
            <Field label="Unidad" htmlFor={id("interval_unit")} error={e("interval_unit")} required>
              <NativeSelect {...register(n("interval_unit"))}>
                <option value="" disabled>
                  Elige…
                </option>
                {INTERVAL_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {INTERVAL_UNIT_META[u].plural}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        )}
      </div>

      {selected && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite" data-testid="price-indicator">
          {!currentModality ? (
            <StatusBadge tone="warning">Modalidad fuera del catálogo: sin tarifa de referencia</StatusBadge>
          ) : listPrice === null ? (
            <StatusBadge tone="neutral">Precio a medida: el catálogo no fija tarifa</StatusBadge>
          ) : deviation && deviation.diff !== 0 ? (
            <>
              <StatusBadge tone="info">Precio personalizado</StatusBadge>
              <span className="tabular">
                Tarifa {formatMoney(listPrice, selected.currency)} · {deviation.diff < 0 ? "descuento" : "suplemento"}{" "}
                {deviation.diff < 0 ? "−" : "+"}
                {formatMoney(Math.abs(deviation.diff), currency || "EUR")}
                {deviation.pct !== null && ` (${deviation.pct > 0 ? "+" : ""}${formatPercent(deviation.pct)} %)`}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setValue(n("amount"), centsToField(listPrice), { shouldDirty: true, shouldValidate: true })}
              >
                Aplicar tarifa
              </Button>
            </>
          ) : deviation ? (
            <StatusBadge tone="success">Tarifa del catálogo</StatusBadge>
          ) : (
            <span className="tabular">Tarifa del catálogo: {formatMoney(listPrice, selected.currency)}</span>
          )}
        </div>
      )}

      {cents !== null && cents > 0 && (
        <p className="tabular flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
          {recurring && (
            <span>
              MRR equivalente: <strong className="font-medium text-foreground">{formatMoney(mrr, currency || "EUR")}</strong>/mes
            </span>
          )}
          {tax && tax.tax !== null && (
            <span>
              Impuesto {formatMoney(tax.tax, currency || "EUR")} · Total{" "}
              <strong className="font-medium text-foreground">{formatMoney(tax.total, currency || "EUR")}</strong>
            </span>
          )}
          {!recurring && <span>Pago único: no computa en MRR.</span>}
        </p>
      )}

      {showVariable ? (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <legend className="flex w-full items-center justify-between px-1 text-xs font-medium text-muted-foreground">
            Componente variable
          </legend>
          <div className="grid gap-4 sm:grid-cols-6">
            <Field label="Porcentaje" htmlFor={id("variable_rate")} error={e("variable_rate")} required className="sm:col-span-2">
              <div className="relative">
                <Input {...register(n("variable_rate"))} inputMode="decimal" placeholder="8" className="tabular pr-8" />
                <PercentIcon className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-subtle-foreground" aria-hidden="true" />
              </div>
            </Field>
            <Field label="Sobre" htmlFor={id("variable_basis")} error={e("variable_basis")} required className="sm:col-span-3">
              <NativeSelect {...register(n("variable_basis"))}>
                <option value="">Elige la base…</option>
                {VARIABLE_BASES.map((b) => (
                  <option key={b} value={b}>
                    {VARIABLE_BASIS_META[b].label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="flex items-end sm:col-span-1">
              <Button type="button" variant="ghost" size="sm" onClick={removeVariable} aria-label="Quitar componente variable">
                <XIcon aria-hidden="true" /> Quitar
              </Button>
            </div>
          </div>
          <p className="text-xs text-subtle-foreground">
            Se suma a la cuota fija. El importe se calcula en cada periodo cuando se conoce la base; hasta entonces queda pendiente y no
            cuenta como ingreso ni en el MRR.
          </p>
        </fieldset>
      ) : (
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setShowVariable(true)}>
          <PlusIcon aria-hidden="true" /> Componente variable (p. ej. % de beneficios)
        </Button>
      )}

      <div className="grid gap-4 sm:grid-cols-6">
        <Field label="Fecha de inicio" htmlFor={id("start_date")} error={e("start_date")} required className="sm:col-span-2">
          <Input {...register(n("start_date"))} type="date" />
        </Field>
        <Field label="Fecha de finalización" htmlFor={id("end_date")} error={e("end_date")} hint="Opcional." className="sm:col-span-2">
          <Input {...register(n("end_date"))} type="date" />
        </Field>
        {recurring && (
          <Field label="Próxima renovación" htmlFor={id("next_renewal_date")} error={e("next_renewal_date")} className="sm:col-span-2">
            <div className="flex gap-1.5">
              <Input {...register(n("next_renewal_date"))} type="date" id={id("next_renewal_date")} />
              <Button type="button" variant="outline" size="sm" className="h-9 sm:h-8" onClick={suggestRenewal}>
                Calcular
              </Button>
            </div>
          </Field>
        )}
      </div>

      {!compact && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Estado" htmlFor={id("status")} error={e("status")} required>
            <NativeSelect {...register(n("status"))}>
              {CONTRACT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CONTRACT_STATUS_META[s].label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Responsable" htmlFor={id("owner_id")} error={e("owner_id")}>
            <NativeSelect {...register(n("owner_id"))}>
              <option value="">Sin asignar</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name || m.email}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Proyecto o web"
            htmlFor={id("project")}
            error={e("project")}
            hint="Opcional. Distingue contrataciones del mismo servicio para webs o proyectos distintos del cliente."
            className="sm:col-span-2"
          >
            <Input {...register(n("project"))} placeholder="Ej. tienda.cliente.com" />
          </Field>
          <Field label="Descripción" htmlFor={id("description")} error={e("description")} className="sm:col-span-2">
            <Textarea {...register(n("description"))} rows={2} />
          </Field>
        </div>
      )}

      <DeliverablesEditor name={n("deliverables")} templates={selected?.deliverables} />

      {!compact && (
        <Field label="Notas internas" htmlFor={id("notes")} error={e("notes")}>
          <Textarea {...register(n("notes"))} rows={2} />
        </Field>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.kind === "service" ? `¿Cambiar a «${pendingService?.name ?? "otro servicio"}»?` : "¿Cambiar de modalidad?"}
        description={
          pending?.kind === "service"
            ? "Has personalizado el precio, la modalidad o las prestaciones de este servicio. Se sustituirán por la tarifa y las prestaciones del nuevo servicio."
            : "Has personalizado el precio. Se sustituirá por la tarifa de la nueva modalidad."
        }
        confirmLabel="Sustituir"
        onConfirm={() => {
          if (pending?.kind === "service") applyCatalog(pending.id);
          if (pending?.kind === "modality") applyModality(pending.modality);
          setPending(null);
        }}
      />
    </div>
  );
}
