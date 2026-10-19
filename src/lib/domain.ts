/**
 * Vocabulario de dominio: valores almacenados (inglés, estables) y etiquetas
 * visibles / valores de Excel (español). Única fuente de verdad para enums.
 */

export const CLIENT_STATUSES = ["lead", "negotiation", "active", "paused", "finished"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CONTRACT_STATUSES = ["draft", "active", "paused", "finished", "cancelled"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "partial", "paid", "overdue", "void"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const BILLING_TYPES = ["one_time", "recurring"] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

export const PERIODICITIES = ["monthly", "quarterly", "semiannual", "annual", "custom"] as const;
export type Periodicity = (typeof PERIODICITIES)[number];

export const INTERVAL_UNITS = ["day", "week", "month", "year"] as const;
export type IntervalUnit = (typeof INTERVAL_UNITS)[number];

export const CATALOG_STATUSES = ["active", "inactive"] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export const CURRENCIES = ["EUR", "USD", "GBP"] as const;

/** Base de cálculo del componente variable. Son magnitudes distintas: no se mezclan. */
export const VARIABLE_BASES = ["profit", "revenue", "billing"] as const;
export type VariableBasis = (typeof VARIABLE_BASES)[number];

export const VARIABLE_BASIS_META: Record<VariableBasis, { label: string; of: string; excel: string }> = {
  profit: { label: "Beneficios", of: "de los beneficios", excel: "beneficios" },
  revenue: { label: "Ingresos", of: "de los ingresos", excel: "ingresos" },
  billing: { label: "Facturación", of: "de la facturación", excel: "facturacion" },
};

/** Estados en los que una contratación cuenta para las reglas de combinación. */
export const LIVE_CONTRACT_STATUSES = ["draft", "active", "paused"] as const;

/** Periodicidades que admite una tarifa del catálogo (la personalizada es solo por contrato). */
export const CATALOG_PERIODICITIES = ["monthly", "quarterly", "semiannual", "annual"] as const;

/** Clave de una modalidad de precio: pago único o recurrente con su periodicidad. */
export function modalityKey(m: { billing_type: string; periodicity?: string | null }): string {
  return m.billing_type === "one_time" ? "one_time" : `recurring:${m.periodicity ?? ""}`;
}

/** Tono visual de cada estado (mapeado a tokens en StatusBadge). */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "muted";

export const CLIENT_STATUS_META: Record<ClientStatus, { label: string; excel: string; tone: Tone }> = {
  lead: { label: "Potencial", excel: "potencial", tone: "neutral" },
  negotiation: { label: "En negociación", excel: "negociacion", tone: "info" },
  active: { label: "Activo", excel: "activo", tone: "success" },
  paused: { label: "Pausado", excel: "pausado", tone: "warning" },
  finished: { label: "Finalizado", excel: "finalizado", tone: "muted" },
};

export const CONTRACT_STATUS_META: Record<ContractStatus, { label: string; excel: string; tone: Tone }> = {
  draft: { label: "Borrador", excel: "borrador", tone: "neutral" },
  active: { label: "Activo", excel: "activo", tone: "success" },
  paused: { label: "Pausado", excel: "pausado", tone: "warning" },
  finished: { label: "Finalizado", excel: "finalizado", tone: "muted" },
  cancelled: { label: "Cancelado", excel: "cancelado", tone: "danger" },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; excel: string; tone: Tone }> = {
  pending: { label: "Pendiente", excel: "pendiente", tone: "neutral" },
  partial: { label: "Parcialmente cobrado", excel: "parcial", tone: "info" },
  paid: { label: "Cobrado", excel: "cobrado", tone: "success" },
  overdue: { label: "Vencido", excel: "vencido", tone: "danger" },
  void: { label: "Anulado", excel: "anulado", tone: "muted" },
};

export const BILLING_TYPE_META: Record<BillingType, { label: string; excel: string }> = {
  one_time: { label: "Pago único", excel: "unico" },
  recurring: { label: "Recurrente", excel: "recurrente" },
};

export const PERIODICITY_META: Record<Periodicity, { label: string; excel: string }> = {
  monthly: { label: "Mensual", excel: "mensual" },
  quarterly: { label: "Trimestral", excel: "trimestral" },
  semiannual: { label: "Semestral", excel: "semestral" },
  annual: { label: "Anual", excel: "anual" },
  custom: { label: "Personalizada", excel: "personalizada" },
};

export const INTERVAL_UNIT_META: Record<IntervalUnit, { label: string; plural: string; excel: string }> = {
  day: { label: "día", plural: "días", excel: "dias" },
  week: { label: "semana", plural: "semanas", excel: "semanas" },
  month: { label: "mes", plural: "meses", excel: "meses" },
  year: { label: "año", plural: "años", excel: "anos" },
};

/** Busca la clave interna a partir de una etiqueta de Excel/humana (tolerante a mayúsculas y tildes). */
export function fromExcelValue<K extends string>(
  meta: Record<K, { label: string; excel: string }>,
  raw: string,
): K | null {
  const n = normalizeToken(raw);
  for (const key of Object.keys(meta) as K[]) {
    const m = meta[key];
    if (normalizeToken(m.excel) === n || normalizeToken(m.label) === n || normalizeToken(key) === n) return key;
  }
  return null;
}

export function normalizeToken(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, " ");
}
