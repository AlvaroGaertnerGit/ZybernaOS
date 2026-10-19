import type { BillingType, CatalogStatus, IntervalUnit, Periodicity, VariableBasis } from "@/lib/domain";
import type { SummaryLine } from "@/lib/calculations/summary";
import type { WizardContractValues } from "@/lib/validations/schemas";
import type { RuleService } from "@/lib/catalog/rules";
import { todayIso } from "@/lib/calculations/dates";
import { centsToField, parseMoneyToCents } from "@/lib/calculations/money";
import { modalityKey } from "@/lib/domain";

export { centsToField, modalityKey };

export type Modality = { billing_type: BillingType; periodicity: Periodicity | null; price_cents: number | null };

/** Forma serializable del catálogo que se pasa a los formularios cliente. */
export type CatalogOption = RuleService & {
  category_id: string;
  description: string | null;
  default_price_cents: number | null;
  currency: string;
  suggested_billing_type: BillingType;
  suggested_periodicity: Periodicity | null;
  status: CatalogStatus;
  deliverables: { title: string; description: string | null }[];
  /** Otras modalidades de precio (la principal es suggested_* + default_price_cents). */
  modalities: Modality[];
};

/** Todas las modalidades de un servicio: la principal primero. */
export function modalitiesOf(svc: CatalogOption): Modality[] {
  return [
    { billing_type: svc.suggested_billing_type, periodicity: svc.suggested_periodicity, price_cents: svc.default_price_cents },
    ...svc.modalities,
  ];
}


/** Tarifa de catálogo para una modalidad concreta (undefined si el servicio no la ofrece). */
export function findModality(svc: CatalogOption, billingType: string, periodicity: string | null | undefined): Modality | undefined {
  const key = modalityKey({ billing_type: billingType, periodicity: periodicity || null });
  return modalitiesOf(svc).find((m) => modalityKey(m) === key);
}


export function contractDefaultsFromCatalog(
  svc: CatalogOption | null,
  opts: { categoryId: string; currency: string; ownerId?: string | null; project?: string },
): WizardContractValues {
  return {
    service_id: svc?.id ?? "",
    category_id: svc?.category_id ?? opts.categoryId,
    name: svc?.name ?? "",
    description: svc?.description ?? "",
    amount: centsToField(svc?.default_price_cents),
    tax_rate: "",
    currency: svc?.currency ?? opts.currency,
    billing_type: svc?.suggested_billing_type ?? "recurring",
    periodicity: svc ? (svc.suggested_periodicity ?? "") : "monthly",
    interval_count: "",
    interval_unit: "",
    start_date: todayIso(),
    end_date: "",
    next_renewal_date: "",
    status: "active",
    owner_id: opts.ownerId ?? "",
    notes: "",
    project: opts.project ?? "",
    variable_rate: "",
    variable_basis: "",
    deliverables: (svc?.deliverables ?? []).map((d) => ({ title: d.title, description: d.description ?? "" })),
  };
}

type Customizable = Pick<WizardContractValues, "amount" | "billing_type" | "periodicity" | "name" | "deliverables">;

/**
 * ¿Se han personalizado los valores respecto a la plantilla del catálogo? Sirve para
 * pedir confirmación antes de descartarlos al cambiar a una alternativa.
 */
export function isCustomized(values: Customizable, svc: CatalogOption | undefined): boolean {
  if (!svc) return false;
  const modality = findModality(svc, values.billing_type, values.periodicity);
  const expectedPrice = modality ? modality.price_cents : svc.default_price_cents;
  const price = parseMoneyToCents(values.amount ?? "");
  if ((expectedPrice ?? null) !== (values.amount?.trim() ? price : null)) return true;
  if (!modality) return true;
  if (values.name.trim() !== svc.name) return true;
  const a = values.deliverables.map((d) => d.title.trim());
  const b = svc.deliverables.map((d) => d.title.trim());
  return a.length !== b.length || a.some((t, i) => t !== b[i]);
}

type SummarySource = Pick<
  WizardContractValues,
  | "name"
  | "service_id"
  | "amount"
  | "billing_type"
  | "periodicity"
  | "interval_count"
  | "interval_unit"
  | "tax_rate"
  | "variable_rate"
  | "variable_basis"
>;

/** Línea del resumen económico a partir de los valores (texto) de un formulario. */
export function summaryLineFromValues(c: SummarySource, catalog: readonly CatalogOption[]): SummaryLine {
  const svc = c.service_id ? catalog.find((s) => s.id === c.service_id) : undefined;
  const recurring = c.billing_type === "recurring";
  const periodicity = recurring ? ((c.periodicity || "monthly") as Periodicity) : null;
  const tax = c.tax_rate ? Number(String(c.tax_rate).replace(",", ".")) : null;
  const rate = c.variable_rate ? Number(String(c.variable_rate).replace(",", ".").replace("%", "")) : null;
  return {
    name: c.name || svc?.name || "Servicio",
    billing_type: c.billing_type as BillingType,
    periodicity,
    interval_count: periodicity === "custom" && c.interval_count ? Number(c.interval_count) : null,
    interval_unit: periodicity === "custom" && c.interval_unit ? (c.interval_unit as IntervalUnit) : null,
    amount_cents: c.amount?.trim() ? parseMoneyToCents(c.amount) : null,
    list_price_cents: svc ? (findModality(svc, c.billing_type, periodicity)?.price_cents ?? null) : null,
    tax_rate: tax !== null && Number.isFinite(tax) ? tax : null,
    variable_rate: rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null,
    variable_basis: (c.variable_basis || null) as VariableBasis | null,
  };
}
