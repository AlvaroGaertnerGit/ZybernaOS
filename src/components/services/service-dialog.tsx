"use client";

import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { catalogServiceSchema, type CatalogServiceFormValues } from "@/lib/validations/schemas";
import { saveCatalogServiceAction } from "@/server/actions/catalog";
import { CURRENCIES, PERIODICITY_META } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { DeliverablesEditor } from "@/components/forms/deliverables-editor";
import { useServerAction } from "@/components/forms/use-action";
import type { CategoryOption } from "@/components/forms/form-utils";
import type { CatalogOption } from "@/components/contracts/catalog-option";

export function ServiceDialog({
  service,
  categories,
  defaultCategoryId,
  open,
  onOpenChange,
}: {
  service: CatalogOption | null;
  categories: CategoryOption[];
  defaultCategoryId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {open && (
          <ServiceForm
            service={service}
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
  categories,
  defaultCategoryId,
  onDone,
}: {
  service: CatalogOption | null;
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
      default_price: service?.default_price_cents != null ? (service.default_price_cents / 100).toFixed(2).replace(".", ",") : "",
      currency: service?.currency ?? "EUR",
      suggested_billing_type: service?.suggested_billing_type ?? "recurring",
      suggested_periodicity: (service?.suggested_periodicity as CatalogServiceFormValues["suggested_periodicity"]) ?? "monthly",
      status: service?.status ?? "active",
      deliverables: (service?.deliverables ?? []).map((d) => ({ title: d.title, description: d.description ?? "" })),
    },
  });
  const billing = useWatch({ control: form.control, name: "suggested_billing_type" });
  const { run, pending } = useServerAction();
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(() => {
    run(() => saveCatalogServiceAction(service?.id ?? null, form.getValues()), { setError: form.setError, onSuccess: onDone });
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{service ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
          <DialogDescription>
            Es una plantilla: al contratarlo se copian sus datos, que pueden ajustarse libremente en cada cliente.
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
          <Field label="Cobro sugerido" htmlFor="svc-billing">
            <NativeSelect {...form.register("suggested_billing_type")}>
              <option value="recurring">Recurrente</option>
              <option value="one_time">Pago único</option>
            </NativeSelect>
          </Field>
          {billing === "recurring" && (
            <Field label="Periodicidad sugerida" htmlFor="svc-periodicity" error={e.suggested_periodicity?.message}>
              <NativeSelect {...form.register("suggested_periodicity")}>
                {(["monthly", "quarterly", "semiannual", "annual"] as const).map((p) => (
                  <option key={p} value={p}>
                    {PERIODICITY_META[p].label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label="Precio orientativo" htmlFor="svc-price" error={e.default_price?.message} hint="Opcional.">
            <Input {...form.register("default_price")} inputMode="decimal" className="tabular" />
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
        <DeliverablesEditor name="deliverables" label="Prestaciones predeterminadas" />
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
