"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { clientSchema, wizardContractSchema, type ClientFormValues, type WizardContractValues } from "@/lib/validations/schemas";
import { createClientWithContractsAction } from "@/server/actions/clients";
import { CLIENT_STATUS_META, PERIODICITY_META, type IntervalUnit, type Periodicity } from "@/lib/domain";
import { formatMoney, parseMoneyToCents } from "@/lib/calculations/money";
import { monthlyRecurringCents, periodicityLabel } from "@/lib/calculations/mrr";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelFooter } from "@/components/ui/panel";
import { useServerAction } from "@/components/forms/use-action";
import type { CategoryOption, MemberOption } from "@/components/forms/form-utils";
import { ContractFields } from "@/components/contracts/contract-fields";
import { contractDefaultsFromCatalog, type CatalogOption } from "@/components/contracts/catalog-option";
import { ClientFields } from "./client-fields";

const wizardFormSchema = z.object({
  client: clientSchema,
  contracts: z.array(wizardContractSchema).max(20),
});
type WizardValues = { client: ClientFormValues; contracts: WizardContractValues[] };

const STEPS = ["Datos básicos", "Servicios", "Precios", "Confirmación"] as const;

export function ClientWizard({
  members,
  categories,
  catalog,
  defaultCurrency,
  currentMemberId,
  today,
}: {
  members: MemberOption[];
  categories: CategoryOption[];
  catalog: CatalogOption[];
  defaultCurrency: string;
  currentMemberId: string;
  today: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const form = useForm<WizardValues>({
    resolver: zodResolver(wizardFormSchema) as never,
    mode: "onBlur",
    defaultValues: {
      client: {
        code: "",
        trade_name: "",
        legal_name: "",
        tax_id: "",
        contact_name: "",
        email: "",
        phone: "",
        website: "",
        address: "",
        sector: "",
        status: "active",
        owner_id: currentMemberId,
        joined_on: today,
        notes: "",
      },
      contracts: [],
    },
  });
  const contracts = useFieldArray({ control: form.control, name: "contracts" });
  const watched = useWatch({ control: form.control, name: "contracts" }) ?? [];
  const { run, pending } = useServerAction();
  const otherCategory = categories.find((c) => c.slug === "other")?.id ?? categories[0]?.id ?? "";

  const selectedIds = new Set(watched.map((c) => c.service_id).filter(Boolean));

  function toggleService(svc: CatalogOption) {
    const idx = watched.findIndex((c) => c.service_id === svc.id);
    if (idx >= 0) contracts.remove(idx);
    else contracts.append(contractDefaultsFromCatalog(svc, { categoryId: otherCategory, currency: defaultCurrency, ownerId: currentMemberId }));
  }

  async function next() {
    if (step === 0) {
      const ok = await form.trigger("client");
      if (!ok) return;
    }
    if (step === 2) {
      const ok = await form.trigger("contracts");
      if (!ok) return;
    }
    if (step === 1 && watched.length === 0) {
      setStep(3);
      return;
    }
    setStep((s) => Math.min(s + 1, 3));
  }

  function back() {
    if (step === 3 && watched.length === 0) setStep(1);
    else setStep((s) => Math.max(s - 1, 0));
  }

  function submit() {
    const values = form.getValues();
    run(() => createClientWithContractsAction(values), {
      setError: form.setError,
      onSuccess: (data) => router.push(`/clientes/${data.id}`),
    });
  }

  const totalMrr = watched.reduce((acc, c) => acc + estimateMrr(c), 0);
  const client = useWatch({ control: form.control, name: "client" });

  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 3) void next();
          else void form.handleSubmit(submit)();
        }}
      >
        <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Pasos">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? "step" : undefined} className="flex flex-col gap-2">
              <span
                className={cn(
                  "h-0.5 rounded-full bg-border transition-colors duration-(--motion-duration-base)",
                  i <= step && "bg-primary",
                )}
              />
              <span className={cn("text-xs text-subtle-foreground", i === step && "font-medium text-foreground")}>
                <span className="tabular mr-1.5 hidden sm:inline">{String(i + 1).padStart(2, "0")}</span>
                {label}
              </span>
            </li>
          ))}
        </ol>

        <Panel>
          <PanelContent className="p-4 sm:p-6">
            <div key={step} className="animate-fade-up">
              {step === 0 && (
                <StepHeading title="¿Quién es el cliente?" description="Solo el nombre comercial es obligatorio. El resto puede completarse después." />
              )}
              {step === 0 && <ClientFields members={members} prefix="client." compact />}

              {step === 1 && (
                <>
                  <StepHeading
                    title="¿Qué servicios contrata?"
                    description="Elige del catálogo o añade uno personalizado. También puedes guardar el cliente sin servicios."
                  />
                  <div className="flex flex-col gap-5">
                    {categories
                      .filter((cat) => catalog.some((s) => s.category_id === cat.id && s.status === "active"))
                      .map((cat) => (
                        <fieldset key={cat.id}>
                          <legend className="eyebrow mb-2">{cat.name}</legend>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {catalog
                              .filter((s) => s.category_id === cat.id && s.status === "active")
                              .map((s) => {
                                const checked = selectedIds.has(s.id);
                                return (
                                  <label
                                    key={s.id}
                                    className={cn(
                                      "group/svc flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3 transition-[border-color,background-color,box-shadow] duration-(--motion-duration-fast) hover:border-border-strong has-focus-visible:ring-2 has-focus-visible:ring-ring",
                                      checked && "border-primary/50 bg-tone-info/40 shadow-xs",
                                    )}
                                  >
                                    <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleService(s)} />
                                    <span
                                      aria-hidden="true"
                                      className={cn(
                                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-border-strong transition-colors",
                                        checked && "border-primary bg-primary text-primary-foreground",
                                      )}
                                    >
                                      {checked && <CheckIcon className="size-3" />}
                                    </span>
                                    <span className="flex min-w-0 flex-col gap-0.5">
                                      <span className="text-sm font-medium">{s.name}</span>
                                      <span className="text-xs text-subtle-foreground">
                                        {s.suggested_billing_type === "one_time"
                                          ? "Pago único"
                                          : PERIODICITY_META[s.suggested_periodicity ?? "monthly"].label}
                                        {s.default_price_cents != null && ` · desde ${formatMoney(s.default_price_cents, s.currency)}`}
                                      </span>
                                    </span>
                                  </label>
                                );
                              })}
                          </div>
                        </fieldset>
                      ))}
                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          contracts.append(
                            contractDefaultsFromCatalog(null, { categoryId: otherCategory, currency: defaultCurrency, ownerId: currentMemberId }),
                          )
                        }
                      >
                        <PlusIcon aria-hidden="true" /> Servicio personalizado
                      </Button>
                      <span className="text-xs text-subtle-foreground" aria-live="polite">
                        {watched.length} seleccionado(s)
                      </span>
                    </div>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <StepHeading title="Precios y condiciones" description="Ajusta precio, periodicidad y prestaciones de cada servicio. Todo es negociable." />
                  <div className="flex flex-col gap-4">
                    {contracts.fields.map((field, i) => (
                      <section key={field.id} className="rounded-lg border border-border">
                        <header className="flex items-center justify-between gap-2 border-b border-border bg-surface-sunken/60 px-3 py-2">
                          <h3 className="truncate text-sm font-medium">{watched[i]?.name || `Servicio ${i + 1}`}</h3>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => contracts.remove(i)}
                            aria-label={`Quitar ${watched[i]?.name || `servicio ${i + 1}`}`}
                          >
                            <Trash2Icon aria-hidden="true" />
                          </Button>
                        </header>
                        <div className="p-3 sm:p-4">
                          <ContractFields
                            prefix={`contracts.${i}.`}
                            categories={categories}
                            catalog={catalog}
                            members={members}
                            showCatalogPicker={false}
                            compact
                          />
                        </div>
                      </section>
                    ))}
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <StepHeading title="Revisa y confirma" description="Se creará el cliente y sus contrataciones en una única operación." />
                  <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                    <Summary label="Cliente" value={client?.trade_name || "—"} />
                    <Summary label="Contacto" value={[client?.contact_name, client?.email].filter(Boolean).join(" · ") || "—"} />
                    <Summary label="Estado" value={client?.status ? CLIENT_STATUS_META[client.status as keyof typeof CLIENT_STATUS_META].label : "—"} />
                  </dl>
                  <div className="mt-6 rounded-lg border border-border">
                    {watched.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                        Sin servicios por ahora. Podrás añadirlos desde la ficha del cliente.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {watched.map((c, i) => (
                          <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{c.name}</p>
                              <p className="text-xs text-subtle-foreground">
                                {c.billing_type === "one_time"
                                  ? "Pago único"
                                  : periodicityLabel(
                                      (c.periodicity || null) as Periodicity | null,
                                      c.interval_count ? Number(c.interval_count) : null,
                                      (c.interval_unit || null) as IntervalUnit | null,
                                    )}{" "}
                                · {c.deliverables.length} prestación(es)
                              </p>
                            </div>
                            <span className="tabular text-sm">{formatMoney(parseMoneyToCents(c.amount) ?? 0, c.currency)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {watched.length > 0 && (
                      <div className="tabular flex justify-between border-t border-border bg-surface-sunken/60 px-4 py-2.5 text-sm">
                        <span className="text-muted-foreground">MRR estimado</span>
                        <strong className="font-medium">{formatMoney(totalMrr, defaultCurrency)}/mes</strong>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </PanelContent>
          <PanelFooter className="justify-between">
            <Button type="button" variant="ghost" onClick={step === 0 ? () => router.back() : back}>
              <ArrowLeftIcon aria-hidden="true" /> {step === 0 ? "Cancelar" : "Atrás"}
            </Button>
            <div className="flex items-center gap-2">
              {step === 1 && watched.length === 0 && (
                <span className="hidden text-xs text-subtle-foreground sm:inline">Puedes continuar sin servicios</span>
              )}
              {step < 3 ? (
                <Button type="submit">
                  Continuar <ArrowRightIcon aria-hidden="true" />
                </Button>
              ) : (
                <Button type="submit" disabled={pending} data-testid="wizard-submit">
                  {pending ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <CheckIcon aria-hidden="true" />}
                  Crear cliente
                </Button>
              )}
            </div>
          </PanelFooter>
        </Panel>
      </form>
    </FormProvider>
  );
}

function estimateMrr(c: WizardContractValues) {
  if (c.billing_type !== "recurring") return 0;
  const cents = parseMoneyToCents(c.amount);
  if (cents === null) return 0;
  return monthlyRecurringCents({
    billing_type: "recurring",
    periodicity: (c.periodicity || null) as Periodicity | null,
    interval_count: c.interval_count ? Number(c.interval_count) : null,
    interval_unit: (c.interval_unit || null) as IntervalUnit | null,
    amount_cents: cents,
  });
}

function StepHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 truncate">{value}</dd>
    </div>
  );
}
