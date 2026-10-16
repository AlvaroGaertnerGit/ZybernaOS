import type { BillingType, CatalogStatus, Periodicity } from "@/lib/domain";
import type { WizardContractValues } from "@/lib/validations/schemas";
import { todayIso } from "@/lib/calculations/dates";

/** Forma serializable del catálogo que se pasa a los formularios cliente. */
export type CatalogOption = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  default_price_cents: number | null;
  currency: string;
  suggested_billing_type: BillingType;
  suggested_periodicity: Periodicity | null;
  status: CatalogStatus;
  deliverables: { title: string; description: string | null }[];
};

export function contractDefaultsFromCatalog(
  svc: CatalogOption | null,
  opts: { categoryId: string; currency: string; ownerId?: string | null },
): WizardContractValues {
  return {
    service_id: svc?.id ?? "",
    category_id: svc?.category_id ?? opts.categoryId,
    name: svc?.name ?? "",
    description: svc?.description ?? "",
    amount: svc?.default_price_cents != null ? (svc.default_price_cents / 100).toFixed(2).replace(".", ",") : "",
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
    deliverables: (svc?.deliverables ?? []).map((d) => ({ title: d.title, description: d.description ?? "" })),
  };
}
