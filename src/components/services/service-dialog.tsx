"use client";

import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { catalogServiceSchema, type CatalogServiceFormValues } from "@/lib/validations/schemas";
import { saveCatalogServiceAction } from "@/server/actions/catalog";
import { CATALOG_PERIODICITIES, CURRENCIES, PERIODICITY_META } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { DeliverablesEditor } from "@/components/forms/deliverables-editor";
import { useServerAction } from "@/components/forms/use-action";
import { errorAt, type CategoryOption } from "@/components/forms/form-utils";
import { centsToField, type CatalogOption } from "@/components/contracts/catalog-option";

export function ServiceDialog({
  service,
  catalog,
  categories,
  defaultCategoryId,
  open,
  onOpenChange,
}: {
  service: CatalogOption | null;
  catalog: CatalogOption[];
  categories: CategoryOption[];
  defaultCategoryId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {open && (
          <ServiceForm
            service={service}
            catalog={catalog}
            categories={categories}
            defaultCategoryId={defaultCategoryId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ServiceForm({
  service,
  catalog,
  categories,
  defaultCategoryId,
  onDone,
}: {
  service: CatalogOption | null;
  catalog: CatalogOption[];
  categories: CategoryOption[];
  defaultCategoryId?: string;
  onDone: () => void;
}) {
  const form = useForm<CatalogServiceFormValues>({
    resolver: zodResolver(catalogServiceSchema) as never,
    defaultValues: {
      category_id: service?.category_id ?? defaultCategoryId ?? categories[0]?.id ?? "",
      name: service?.name ?? "",
      description: service?.description ?? "",
      default_price: centsToField(service?.default_price_cents),
      currency: service?.currency ?? "EUR",
      suggested_billing_type: service?.suggested_billing_type ?? "recurring",
      suggested_periodicity: (service?.suggested_periodicity as CatalogServiceFormValues["suggested_periodicity"]) ?? "monthly",
      status: service?.status ?? "active",
      deliverables: (service?.deliverables ?? []).map((d) => ({ title: d.title, description: d.description ?? "" })),
      exclusive_group: service?.exclusive_group ?? "",
      requires_any: [...(service?.requires_any ?? [])],
      excludes: [...(service?.excludes ?? [])],
      modalities: (service?.modalities ?? []).map((m) => ({
        billing_type: m.billing_type,
        periodicity: (m.periodicity ?? "") as CatalogServiceFormValues["modalities"][number]["periodicity"],
        price: centsToField(m.price_cents),
      })),
    },
  });
  const modalities = useFieldArray({ control: form.control, name: "modalities" });
  const [billing, modalityValues, requires, excludes] = useWatch({
    control: form.control,
    name: ["suggested_billing_type", "modalities", "requires_any", "excludes"],
  });
  const { run, pending } = useServerAction();
  const e = form.formState.errors;
  const others = catalog.filter((s) => s.id !== service?.id);
  const groups = [...new Set(catalog.map((s) => s.exclusive_group).filter((g): g is string => Boolean(g)))];

  const onSubmit = form.handleSubmit(() => {
    run(() => saveCatalogServiceAction(service?.id ?? null, form.getValues()), { setError: form.setError, onSuccess: onDone });
  });

  function toggle(field: "requires_any" | "excludes", ref: string) {
    const list = form.getValues(field);
    form.setValue(field, list.includes(ref) ? list.filter((x) => x !== ref) : [...list, ref], { shouldDirty: true });
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{service ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
          <DialogDescription>
            Tarifa de referencia: al contratar se copian precio y prestaciones, que pueden ajustarse para cada cliente. Cambiarla no
            altera contratos existentes.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="svc-name" error={e.name?.message} required className="sm:col-span-2">
            <Input {...form.register("name")} />
          </Field>
          <Field label="Categoría" htmlFor="svc-category" error={e.category_id?.message} required>
            <NativeSelect {...form.register("category_id")}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Estado" htmlFor="svc-status">
            <NativeSelect {...form.register("status")}>
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </NativeSelect>
          </Field>
          <Field label="Modelo de facturación" htmlFor="svc-billing">
            <NativeSelect {...form.register("suggested_billing_type")}>
              <option value="recurring">Recurrente</option>
              <option value="one_time">Pago único</option>
            </NativeSelect>
          </Field>
          {billing === "recurring" && (
            <Field label="Periodicidad" htmlFor="svc-periodicity" error={e.suggested_periodicity?.message}>
              <NativeSelect {...form.register("suggested_periodicity")}>
                {CATALOG_PERIODICITIES.map((p) => (
                  <option key={p} value={p}>
                    {PERIODICITY_META[p].label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label="Precio base" htmlFor="svc-price" error={e.default_price?.message} hint="Sin impuestos. Vacío = precio a medida.">
            <Input {...form.register("default_price")} inputMode="decimal" className="tabular" placeholder="A medida" />
          </Field>
          <Field label="Moneda" htmlFor="svc-currency">
            <NativeSelect {...form.register("currency")}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Descripción" htmlFor="svc-description" error={e.description?.message} className="sm:col-span-2">
            <Textarea {...form.register("description")} rows={2} />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
            Otras modalidades <span className="text-subtle-foreground">({modalities.fields.length})</span>
          </legend>
          <p className="text-xs text-subtle-foreground">
            Alternativas de la misma contratación (p. ej. anual o pago único) con su propia tarifa. Al contratar se elige una sola.
          </p>
          {modalities.fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2 sm:grid-cols-[10rem_10rem_8rem_auto]">
              <NativeSelect {...form.register(`modalities.${i}.billing_type`)} aria-label={`Modelo de la modalidad ${i + 1}`}>
                <option value="recurring">Recurrente</option>
                <option value="one_time">Pago único</option>
              </NativeSelect>
              {modalityValues?.[i]?.billing_type === "recurring" ? (
                <NativeSelect {...form.register(`modalities.${i}.periodicity`)} aria-label={`Periodicidad de la modalidad ${i + 1}`}>
                  <option value="">Periodicidad…</option>
                  {CATALOG_PERIODICITIES.map((p) => (
                    <option key={p} value={p}>
                      {PERIODICITY_META[p].label}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <span className="hidden sm:block" />
              )}
              <Input
                {...form.register(`modalities.${i}.price`)}
                inputMode="decimal"
                className="tabular"
                placeholder="A medida"
                aria-label={`Precio de la modalidad ${i + 1}`}
              />
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => modalities.remove(i)} aria-label={`Eliminar modalidad ${i + 1}`}>
                <Trash2Icon aria-hidden="true" />
              </Button>
              {(errorAt(e, `modalities.${i}.periodicity`) || errorAt(e, `modalities.${i}.price`)) && (
                <p className="col-span-full text-xs text-destructive">
                  {errorAt(e, `modalities.${i}.periodicity`) ?? errorAt(e, `modalities.${i}.price`)}
                </p>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={modalities.fields.length >= 10}
            onClick={() => modalities.append({ billing_type: "recurring", periodicity: "", price: "" })}
          >
            <PlusIcon aria-hidden="true" /> Añadir modalidad
          </Button>
        </fieldset>

        <DeliverablesEditor name="deliverables" label="Prestaciones incluidas" />

        <details className="rounded-lg border border-border" open={Boolean(service?.exclusive_group || requires?.length || excludes?.length)}>
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Reglas de combinación</summary>
          <div className="flex flex-col gap-4 border-t border-border p-3">
            <Field
              label="Grupo de alternativas"
              htmlFor="svc-group"
              error={e.exclusive_group?.message}
              hint="Los servicios con el mismo grupo son alternativos: solo uno por cliente y proyecto (p. ej. planes SEO)."
            >
              <Input {...form.register("exclusive_group")} list="svc-groups" placeholder="Sin grupo" autoCapitalize="none" />
            </Field>
            <datalist id="svc-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <RefPicker
              label="Requiere (uno de)"
              hint="Solo se puede contratar junto a alguno de estos servicios en el mismo proyecto. Úsalo únicamente si es una condición comercial real."
              groups={groups}
              services={others}
              value={requires ?? []}
              onToggle={(ref) => toggle("requires_any", ref)}
            />
            <RefPicker
              label="Incompatible con"
              hint="No se puede contratar junto a estos servicios en el mismo proyecto (la regla se aplica en ambos sentidos)."
              services={others}
              value={excludes ?? []}
              onToggle={(ref) => toggle("excludes", ref)}
            />
            {service && <p className="text-xs text-subtle-foreground">Identificador estable: <code>{service.key}</code></p>}
          </div>
        </details>

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
    </FormProvider>
  );
}

function RefPicker({
  label,
  hint,
  groups = [],
  services,
  value,
  onToggle,
}: {
  label: string;
  hint: string;
  groups?: string[];
  services: CatalogOption[];
  value: string[];
  onToggle: (ref: string) => void;
}) {
  const options = [
    ...groups.map((g) => ({ ref: `group:${g}`, label: `Cualquiera del grupo «${g}»` })),
    ...services.map((s) => ({ ref: s.key, label: s.name })),
  ];
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-xs font-medium text-muted-foreground">{label}</legend>
      <p className="text-xs text-subtle-foreground">{hint}</p>
      <div className="grid max-h-40 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.ref} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-surface-sunken">
            <input type="checkbox" className="accent-primary" checked={value.includes(o.ref)} onChange={() => onToggle(o.ref)} />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
