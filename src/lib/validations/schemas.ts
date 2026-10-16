import { z } from "zod";
import {
  BILLING_TYPES,
  CATALOG_STATUSES,
  CLIENT_STATUSES,
  CONTRACT_STATUSES,
  INTERVAL_UNITS,
  PERIODICITIES,
} from "@/lib/domain";
import {
  currency,
  entityCode,
  isoDate,
  moneyCents,
  optionalEmail,
  optionalIsoDate,
  optionalMoneyCents,
  optionalTaxRate,
  optionalText,
  optionalUrl,
  optionalUuid,
  requiredText,
  uuid,
} from "./common";

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------
export const clientSchema = z.object({
  code: entityCode,
  trade_name: requiredText("El nombre comercial"),
  legal_name: optionalText(200),
  tax_id: optionalText(30),
  contact_name: optionalText(120),
  email: optionalEmail,
  phone: optionalText(40),
  website: optionalUrl,
  address: optionalText(300),
  sector: optionalText(80),
  status: z.enum(CLIENT_STATUSES),
  owner_id: optionalUuid,
  joined_on: isoDate("Fecha de alta"),
  notes: optionalText(5000),
});
export type ClientFormValues = z.input<typeof clientSchema>;
export type ClientInput = z.output<typeof clientSchema>;

export const clientNoteSchema = z.object({
  client_id: uuid,
  body: requiredText("La nota", 5000),
});

// ---------------------------------------------------------------------------
// Prestaciones
// ---------------------------------------------------------------------------
export const deliverableSchema = z.object({
  title: requiredText("La prestación", 200),
  description: optionalText(1000),
});
export const deliverablesSchema = z.array(deliverableSchema).max(100, "Máximo 100 prestaciones");
export type DeliverableFormValues = z.input<typeof deliverableSchema>;

// ---------------------------------------------------------------------------
// Contrataciones
// ---------------------------------------------------------------------------
const contractBase = z.object({
  code: entityCode,
  client_id: uuid,
  service_id: optionalUuid,
  category_id: uuid,
  name: requiredText("El nombre"),
  description: optionalText(2000),
  amount: moneyCents("Precio"),
  tax_rate: optionalTaxRate,
  currency,
  billing_type: z.enum(BILLING_TYPES),
  periodicity: z.union([z.enum(PERIODICITIES), z.literal("")]).transform((v) => (v === "" ? null : v)),
  interval_count: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 1000) {
        ctx.addIssue({ code: "custom", message: "Intervalo: número entero entre 1 y 1000" });
        return z.NEVER;
      }
      return n;
    }),
  interval_unit: z.union([z.enum(INTERVAL_UNITS), z.literal("")]).transform((v) => (v === "" ? null : v)),
  start_date: isoDate("Fecha de inicio"),
  end_date: optionalIsoDate("Fecha de finalización"),
  next_renewal_date: optionalIsoDate("Próxima renovación"),
  status: z.enum(CONTRACT_STATUSES),
  owner_id: optionalUuid,
  notes: optionalText(5000),
  deliverables: deliverablesSchema,
});

export const contractSchema = contractBase.transform((v, ctx) => {
  if (v.billing_type === "one_time") {
    return { ...v, periodicity: null, interval_count: null, interval_unit: null };
  }
  if (!v.periodicity) {
    ctx.addIssue({ code: "custom", path: ["periodicity"], message: "Elige una periodicidad" });
    return z.NEVER;
  }
  if (v.periodicity === "custom") {
    if (!v.interval_count) ctx.addIssue({ code: "custom", path: ["interval_count"], message: "Indica cada cuánto se cobra" });
    if (!v.interval_unit) ctx.addIssue({ code: "custom", path: ["interval_unit"], message: "Indica la unidad" });
    if (!v.interval_count || !v.interval_unit) return z.NEVER;
    return v;
  }
  return { ...v, interval_count: null, interval_unit: null };
}).superRefine((v, ctx) => {
  if (v.end_date && v.end_date < v.start_date) {
    ctx.addIssue({ code: "custom", path: ["end_date"], message: "La finalización no puede ser anterior al inicio" });
  }
});
export type ContractFormValues = z.input<typeof contractSchema>;
export type ContractInput = z.output<typeof contractSchema>;

/** Contratación dentro del asistente de alta (sin client_id todavía). */
export const wizardContractSchema = contractBase.omit({ client_id: true, code: true });
export type WizardContractValues = z.input<typeof wizardContractSchema>;

// ---------------------------------------------------------------------------
// Cobros
// ---------------------------------------------------------------------------
export const paymentSchema = z.object({
  client_id: uuid,
  client_service_id: optionalUuid,
  concept: requiredText("El concepto", 200),
  amount_due: moneyCents("Importe previsto", { allowZero: false }),
  tax_rate: optionalTaxRate,
  currency,
  due_date: isoDate("Fecha de vencimiento"),
  invoice_ref: optionalText(60),
  notes: optionalText(2000),
});
export type PaymentFormValues = z.input<typeof paymentSchema>;

export const transactionSchema = z.object({
  payment_id: uuid,
  amount: moneyCents("Importe cobrado", { allowZero: false }),
  paid_on: isoDate("Fecha de cobro"),
  method: optionalText(60),
  note: optionalText(500),
  idempotency_key: z.string().min(8).max(120),
});
export type TransactionFormValues = z.input<typeof transactionSchema>;

export const generatePaymentsSchema = z.object({
  contract_id: uuid,
  until: isoDate("Hasta"),
});

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------
export const catalogServiceSchema = z
  .object({
    category_id: uuid,
    name: requiredText("El nombre", 120),
    description: optionalText(2000),
    default_price: optionalMoneyCents("Precio orientativo"),
    currency,
    suggested_billing_type: z.enum(BILLING_TYPES),
    suggested_periodicity: z
      .union([z.enum(["monthly", "quarterly", "semiannual", "annual"] as const), z.literal("")])
      .transform((v) => (v === "" ? null : v)),
    status: z.enum(CATALOG_STATUSES),
    deliverables: deliverablesSchema,
  })
  .transform((v, ctx) => {
    if (v.suggested_billing_type === "one_time") return { ...v, suggested_periodicity: null };
    if (!v.suggested_periodicity) {
      ctx.addIssue({ code: "custom", path: ["suggested_periodicity"], message: "Elige una periodicidad sugerida" });
      return z.NEVER;
    }
    return v;
  });
export type CatalogServiceFormValues = z.input<typeof catalogServiceSchema>;

export const categorySchema = z.object({
  name: requiredText("El nombre", 80),
  description: optionalText(300),
  is_active: z.boolean(),
});

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
export const agencySettingsSchema = z.object({
  name: requiredText("El nombre", 120),
  legal_name: optionalText(200),
  tax_id: optionalText(30),
  email: optionalEmail,
  phone: optionalText(40),
  website: optionalUrl,
  address: optionalText(300),
  default_currency: currency,
  default_tax_rate: optionalTaxRate,
});
export type AgencySettingsFormValues = z.input<typeof agencySettingsSchema>;

export const profileSchema = z.object({
  full_name: requiredText("El nombre", 120),
});

export const passwordSchema = z
  .object({
    password: z.string().min(10, "Mínimo 10 caracteres").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden" });

export const loginSchema = z.object({
  email: z.email("Email no válido").trim().toLowerCase(),
  password: z.string().min(1, "Introduce la contraseña").max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.email("Email no válido").trim().toLowerCase(),
});
