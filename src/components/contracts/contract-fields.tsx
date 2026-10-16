"use client";

import { useFormContext, useWatch, type FieldValues } from "react-hook-form";
import {
  BILLING_TYPE_META,
  CONTRACT_STATUSES,
  CONTRACT_STATUS_META,
  CURRENCIES,
  INTERVAL_UNITS,
  INTERVAL_UNIT_META,
  PERIODICITIES,
  PERIODICITY_META,
  type BillingType,
  type IntervalUnit,
  type Periodicity,
} from "@/lib/domain";
import { computeTax, formatMoney, parseMoneyToCents } from "@/lib/calculations/money";
import { monthlyRecurringCents } from "@/lib/calculations/mrr";
import { nextRenewal } from "@/lib/calculations/billing";
import { isIsoDate, todayIso } from "@/lib/calculations/dates";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { DeliverablesEditor } from "@/components/forms/deliverables-editor";
import { errorAt, type CategoryOption, type MemberOption } from "@/components/forms/form-utils";
import type { CatalogOption } from "./catalog-option";

/** Campos de una contratación (precio, cobro, fechas, prestaciones). */
export function ContractFields({
  prefix = "",
  categories,
  catalog,
  members,
  showCatalogPicker = true,
  compact = false,
}: {
  prefix?: string;
  categories: CategoryOption[];
  catalog: CatalogOption[];
  members: MemberOption[];
  showCatalogPicker?: boolean;
  compact?: boolean;
}) {
  const { register, formState, setValue, control } = useFormContext<FieldValues>();
  const n = (k: string) => `${prefix}${k}`;
  const e = (k: string) => errorAt(formState.errors, n(k));
  const id = (k: string) => `contract-${prefix.replace(/\W/g, "")}${k}`;

  const [billingType, periodicity, amount, currency, taxRate, count, unit, startDate, serviceId, categoryId] = useWatch({
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
    ],
  }) as string[];

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

  function applyCatalog(idValue: string) {
    setValue(n("service_id"), idValue, { shouldDirty: true });
    const svc = catalog.find((c) => c.id === idValue);
    if (!svc) return;
    setValue(n("category_id"), svc.category_id, { shouldDirty: true });
    setValue(n("name"), svc.name, { shouldDirty: true, shouldValidate: true });
    if (svc.description) setValue(n("description"), svc.description);
    setValue(n("billing_type"), svc.suggested_billing_type);
    setValue(n("periodicity"), svc.suggested_periodicity ?? "");
    if (svc.default_price_cents !== null) setValue(n("amount"), (svc.default_price_cents / 100).toFixed(2).replace(".", ","));
    setValue(
      n("deliverables"),
      svc.deliverables.map((d) => ({ title: d.title, description: d.description ?? "" })),
    );
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

  const activeCategories = categories.filter((c) => c.is_active || c.id === categoryId);

  return (
    <div className="flex flex-col gap-5">
      {showCatalogPicker && (
        <Field
          label="Servicio del catálogo"
          htmlFor={id("service_id")}
          hint="Opcional. Rellena nombre, periodicidad, precio orientativo y prestaciones; todo es editable."
        >
          <NativeSelect value={serviceId ?? ""} onChange={(ev) => applyCatalog(ev.target.value)}>
            <option value="">Personalizado (sin plantilla)</option>
            {categories.map((cat) => {
              const items = catalog.filter((c) => c.category_id === cat.id && c.status === "active");
              if (!items.length) return null;
              return (
                <optgroup key={cat.id} label={cat.name}>
                  {items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </NativeSelect>
        </Field>
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
    </div>
  );
}
