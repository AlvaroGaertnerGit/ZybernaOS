"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, InfoIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { clientSchema, wizardContractSchema, type ClientFormValues, type WizardContractValues } from "@/lib/validations/schemas";
import { createClientWithContractsAction } from "@/server/actions/clients";
import { CLIENT_STATUS_META, PERIODICITY_META, type IntervalUnit, type Periodicity } from "@/lib/domain";
import { formatMoney, formatPercent, parseMoneyToCents } from "@/lib/calculations/money";
import { periodicityLabel } from "@/lib/calculations/mrr";
import { economicSummary, priceDeviation } from "@/lib/calculations/summary";
import { findViolations, hasUnmetRequirements, requirementLabel, selectService } from "@/lib/catalog/rules";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelFooter } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { useServerAction } from "@/components/forms/use-action";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import type { CategoryOption, MemberOption } from "@/components/forms/form-utils";
import { ContractFields } from "@/components/contracts/contract-fields";
import { EconomicSummaryPanel } from "@/components/contracts/economic-summary";
import {
  contractDefaultsFromCatalog,
  isCustomized,
  summaryLineFromValues,
  type CatalogOption,
} from "@/components/contracts/catalog-option";
import { ClientFields } from "./client-fields";

const wizardFormSchema = z.object({
  client: clientSchema,
  contracts: z.array(wizardContractSchema).max(20),
});
type WizardValues = { client: ClientFormValues; contracts: WizardContractValues[] };

const STEPS = ["Datos básicos", "Servicios", "Precios", "Confirmación"] as const;

type Confirmation = { title: string; description: React.ReactNode; confirmLabel: string; apply: () => void };

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
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
  const byId = useMemo(() => new Map(catalog.map((s) => [s.id, s])), [catalog]);

  const selectedIds = watched.map((c) => c.service_id).filter((v): v is string => Boolean(v));
  const summary = economicSummary(watched.map((c) => summaryLineFromValues(c, catalog)));
  const defaults = (svc: CatalogOption) =>
    contractDefaultsFromCatalog(svc, { categoryId: otherCategory, currency: defaultCurrency, ownerId: currentMemberId });
  const indexOf = (serviceId: string) => form.getValues("contracts").findIndex((c) => c.service_id === serviceId);
  const nameOf = (serviceId: string) => byId.get(serviceId)?.name ?? "servicio";

  /**
   * Marca o desmarca un servicio aplicando las reglas del catálogo: las alternativas e
   * incompatibles se desmarcan solas y los servicios que dependían de lo quitado también.
   * Si se van a perder personalizaciones o dependientes, se pide confirmación.
   */
  function changeSelection(svc: CatalogOption, action: "select" | "deselect") {
    const before = selectedIds;
    const { selected: after, removed } =
      action === "select" ? selectService(before, svc.id, catalog) : { selected: before.filter((x) => x !== svc.id), removed: [svc.id] };
    const broken = after.filter((x) => hasUnmetRequirements(x, after, catalog) && !hasUnmetRequirements(x, before, catalog));
    const dropped = [...removed, ...broken];
    const current = form.getValues("contracts");
    const customized = dropped.filter((x) => {
      const i = indexOf(x);
      return i >= 0 && isCustomized(current[i], byId.get(x));
    });

    const apply = () => {
      const values = form.getValues("contracts");
      const indexes = dropped.map((x) => values.findIndex((c) => c.service_id === x)).filter((i) => i >= 0);
      if (action === "select") {
        // La alternativa sustituye a la anterior en su misma posición (sin sumar importes).
        const target = removed.length ? values.findIndex((c) => c.service_id === removed[0]) : -1;
        const rest = indexes.filter((i) => i !== target);
        if (target >= 0) contracts.update(target, defaults(svc));
        if (rest.length) contracts.remove(rest);
        if (target < 0) contracts.append(defaults(svc));
      } else if (indexes.length) {
        contracts.remove(indexes);
      }
      const parts: string[] = [];
      for (const x of removed.filter((r) => r !== svc.id)) {
        const kind = byId.get(x)?.exclusive_group && byId.get(x)?.exclusive_group === svc.exclusive_group ? "sustituido por" : "quitado: no es compatible con";
        parts.push(`«${nameOf(x)}» ${kind} «${svc.name}».`);
      }
      for (const x of broken) parts.push(`«${nameOf(x)}» quitado: requiere ${requirementLabel(byId.get(x)!, catalog)}.`);
      setNotice(parts.length ? parts.join(" ") : null);
    };

    if (customized.length || broken.length) {
      setConfirm({
        title: action === "select" ? `¿Cambiar a «${svc.name}»?` : `¿Quitar «${svc.name}»?`,
        description: (
          <span className="flex flex-col gap-2">
            {customized.length > 0 && (
              <span>
                Se perderán los cambios de precio, modalidad o prestaciones de: <strong>{customized.map(nameOf).join(", ")}</strong>.
              </span>
            )}
            {broken.length > 0 && (
              <span>
                También se quitará <strong>{broken.map(nameOf).join(", ")}</strong>, porque requiere{" "}
                {requirementLabel(byId.get(broken[0])!, catalog)}.
              </span>
            )}
          </span>
        ),
        confirmLabel: action === "select" ? "Sustituir" : "Quitar",
        apply,
      });
    } else {
      apply();
    }
  }

  function removeContract(i: number) {
    const sid = watched[i]?.service_id;
    const svc = sid ? byId.get(sid) : undefined;
    if (svc) changeSelection(svc, "deselect");
    else contracts.remove(i);
  }

  async function next() {
    if (step === 0) {
      const ok = await form.trigger("client");
      if (!ok) return;
    }
    if (step === 1 || step === 2) {
      const violations = findViolations(watched, catalog);
      if (violations.length) {
        setNotice(violations[0].message);
        return;
      }
    }
    if (step === 2) {
      const ok = await form.trigger("contracts");
      if (!ok) return;
    }
    if (step === 1 && watched.length === 0) {
      setStep(3);
      return;
    }
    setNotice(null);
    setStep((s) => Math.min(s + 1, 3));
  }

  function back() {
    setNotice(null);
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
                    description="Cada servicio carga su tarifa y sus prestaciones del catálogo. Los planes alternativos se sustituyen entre sí; los complementos se suman."
                  />
                  <div className="flex flex-col gap-5">
                    {categories
                      .filter((cat) => catalog.some((s) => s.category_id === cat.id && s.status === "active"))
                      .map((cat) => (
                        <CategoryServices
                          key={cat.id}
                          name={cat.name}
                          services={catalog.filter((s) => s.category_id === cat.id && s.status === "active")}
                          catalog={catalog}
                          selectedIds={selectedIds}
                          onSelect={(svc) => changeSelection(svc, "select")}
                          onDeselect={(svc) => changeSelection(svc, "deselect")}
                        />
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
                      <span className="text-xs text-subtle-foreground">
                        {watched.length} seleccionado(s){watched.some((c) => !c.service_id) && " · incluye servicios a medida"}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <StepHeading
                    title="Precios y condiciones"
                    description="Se proponen las tarifas del catálogo. Ajusta precio, modalidad y prestaciones para este cliente: el catálogo no cambia."
                  />
                  <div className="flex flex-col gap-4">
                    {contracts.fields.map((field, i) => (
                      <section key={field.id} className="rounded-lg border border-border">
                        <header className="flex items-center justify-between gap-2 border-b border-border bg-surface-sunken/60 px-3 py-2">
                          <h3 className="truncate text-sm font-medium">{watched[i]?.name || `Servicio ${i + 1}`}</h3>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeContract(i)}
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
                        {watched.map((c, i) => {
                          const line = summaryLineFromValues(c, catalog);
                          const dev = priceDeviation(line.amount_cents, line.list_price_cents);
                          return (
                            <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                              <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2 truncate text-sm font-medium">
                                  {c.name}
                                  {dev && dev.diff !== 0 && <StatusBadge tone="info">Precio personalizado</StatusBadge>}
                                </p>
                                <p className="text-xs text-subtle-foreground">
                                  {c.billing_type === "one_time"
                                    ? "Pago único"
                                    : periodicityLabel(
                                        (c.periodicity || null) as Periodicity | null,
                                        c.interval_count ? Number(c.interval_count) : null,
                                        (c.interval_unit || null) as IntervalUnit | null,
                                      )}{" "}
                                  · {c.deliverables.length} prestación(es)
                                  {line.variable_rate && ` · + ${formatPercent(line.variable_rate)} % variable`}
                                </p>
                              </div>
                              <span className="tabular text-sm">{formatMoney(parseMoneyToCents(c.amount) ?? 0, c.currency)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}

              {step > 0 && (watched.length > 0 || step === 1) && (
                <EconomicSummaryPanel summary={summary} currency={defaultCurrency} className="mt-6" />
              )}
              {notice && step > 0 && (
                <p role="status" className="mt-4 flex gap-2 rounded-lg bg-tone-info px-3 py-2 text-sm text-tone-info-foreground">
                  <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {notice}
                </p>
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
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel ?? "Confirmar"}
        onConfirm={() => {
          confirm?.apply();
          setConfirm(null);
        }}
      />
    </FormProvider>
  );
}

/** Precio y periodicidad de la tarifa principal, para las tarjetas de selección. */
function priceText(s: CatalogOption) {
  const when = s.suggested_billing_type === "one_time" ? "Pago único" : PERIODICITY_META[s.suggested_periodicity ?? "monthly"].label;
  const suffix = s.suggested_billing_type === "one_time" ? "" : s.suggested_periodicity === "monthly" ? "/mes" : "";
  const price = s.default_price_cents != null ? `${formatMoney(s.default_price_cents, s.currency)}${suffix}` : "Precio a medida";
  const extra = s.modalities.length ? ` · +${s.modalities.length} modalidad(es)` : "";
  return `${when} · ${price}${extra} · ${s.deliverables.length} prestaciones`;
}

/**
 * Servicios de una categoría. Los de un mismo grupo de alternativas se muestran como un
 * grupo de opciones (solo una, con «Ninguno»); el resto, como casillas independientes.
 */
function CategoryServices({
  name,
  services,
  catalog,
  selectedIds,
  onSelect,
  onDeselect,
}: {
  name: string;
  services: CatalogOption[];
  catalog: CatalogOption[];
  selectedIds: string[];
  onSelect: (svc: CatalogOption) => void;
  onDeselect: (svc: CatalogOption) => void;
}) {
  const groups = new Map<string, CatalogOption[]>();
  const singles: CatalogOption[] = [];
  for (const s of services) {
    if (s.exclusive_group) groups.set(s.exclusive_group, [...(groups.get(s.exclusive_group) ?? []), s]);
    else singles.push(s);
  }
  const byPrice = (a: CatalogOption, b: CatalogOption) =>
    (a.default_price_cents ?? Number.MAX_SAFE_INTEGER) - (b.default_price_cents ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name);

  return (
    <fieldset>
      <legend className="eyebrow mb-2">{name}</legend>
      <div className="flex flex-col gap-3">
        {[...groups.entries()].map(([group, items]) => {
          const chosen = items.find((s) => selectedIds.includes(s.id));
          return (
            <div key={group} role="radiogroup" aria-label={`${name}: elige una opción`} className="flex flex-col gap-2">
              <p className="text-xs text-subtle-foreground">Planes alternativos · elige uno como máximo</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {[...items].sort(byPrice).map((s) => (
                  <ServiceCard
                    key={s.id}
                    svc={s}
                    type="radio"
                    name={`group-${group}`}
                    checked={chosen?.id === s.id}
                    disabledReason={null}
                    onToggle={() => onSelect(s)}
                  />
                ))}
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground transition-colors hover:border-border-strong has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    !chosen && "border-primary/50 text-foreground",
                  )}
                >
                  <input type="radio" className="sr-only" name={`group-${group}`} checked={!chosen} onChange={() => chosen && onDeselect(chosen)} />
                  <Indicator type="radio" checked={!chosen} />
                  Ninguno
                </label>
              </div>
            </div>
          );
        })}
        {singles.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {singles.map((s) => {
              const checked = selectedIds.includes(s.id);
              const unmet = !checked && hasUnmetRequirements(s.id, [...selectedIds, s.id], catalog);
              return (
                <ServiceCard
                  key={s.id}
                  svc={s}
                  type="checkbox"
                  checked={checked}
                  disabledReason={unmet ? `Requiere ${requirementLabel(s, catalog)}` : null}
                  onToggle={() => (checked ? onDeselect(s) : onSelect(s))}
                />
              );
            })}
          </div>
        )}
      </div>
    </fieldset>
  );
}

function ServiceCard({
  svc,
  type,
  name,
  checked,
  disabledReason,
  onToggle,
}: {
  svc: CatalogOption;
  type: "radio" | "checkbox";
  name?: string;
  checked: boolean;
  disabledReason: string | null;
  onToggle: () => void;
}) {
  const disabled = Boolean(disabledReason);
  return (
    <label
      data-testid={`service-${svc.key}`}
      className={cn(
        "group/svc flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3 transition-[border-color,background-color,box-shadow] duration-(--motion-duration-fast) hover:border-border-strong has-focus-visible:ring-2 has-focus-visible:ring-ring",
        checked && "border-primary/50 bg-tone-info/40 shadow-xs",
        disabled && "cursor-not-allowed opacity-60 hover:border-border",
      )}
    >
      <input type={type} name={name} className="sr-only" checked={checked} disabled={disabled} onChange={onToggle} />
      <Indicator type={type} checked={checked} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{svc.name}</span>
        <span className="text-xs text-subtle-foreground">{priceText(svc)}</span>
        {disabledReason && <span className="text-xs text-tone-warning-foreground">{disabledReason}</span>}
      </span>
    </label>
  );
}

function Indicator({ type, checked }: { type: "radio" | "checkbox"; checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 flex size-4 shrink-0 items-center justify-center border border-border-strong transition-colors",
        type === "radio" ? "rounded-full" : "rounded",
        checked && "border-primary bg-primary text-primary-foreground",
      )}
    >
      {checked && (type === "radio" ? <span className="size-1.5 rounded-full bg-current" /> : <CheckIcon className="size-3" />)}
    </span>
  );
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
