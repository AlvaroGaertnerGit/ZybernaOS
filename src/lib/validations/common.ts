import { z } from "zod";
import { isIsoDate } from "@/lib/calculations/dates";
import { parseMoneyToCents } from "@/lib/calculations/money";

/** Texto opcional: "" → null. */
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((v) => (v === "" ? null : v));

export const requiredText = (label: string, max = 160) =>
  z.string().trim().min(1, `${label} es obligatorio`).max(max, `Máximo ${max} caracteres`);

export const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((v) => v === "" || z.email().safeParse(v).success, "Email no válido")
  .transform((v) => (v === "" ? null : v.toLowerCase()));

export const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v === "" ? null : /^https?:\/\//i.test(v) ? v : `https://${v}`))
  .refine((v) => v === null || URL.canParse(v), "URL no válida");

export const isoDate = (label: string) =>
  z.string().trim().refine(isIsoDate, `${label}: fecha no válida`);

export const optionalIsoDate = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || isIsoDate(v), `${label}: fecha no válida`)
    .transform((v) => (v === "" ? null : v));

export const uuid = z.uuid("Identificador no válido");

export const optionalUuid = z
  .string()
  .trim()
  .refine((v) => v === "" || z.uuid().safeParse(v).success, "Identificador no válido")
  .transform((v) => (v === "" ? null : v));

/** Importe en texto ("1.200,50") → céntimos enteros. */
export const moneyCents = (label: string, { allowZero = true } = {}) =>
  z.string().trim().transform((v, ctx) => {
    const cents = parseMoneyToCents(v);
    if (cents === null || (!allowZero && cents === 0)) {
      ctx.addIssue({ code: "custom", message: `${label}: importe no válido` });
      return z.NEVER;
    }
    return cents;
  });

export const optionalMoneyCents = (label: string) =>
  z.string().trim().transform((v, ctx) => {
    if (v === "") return null;
    const cents = parseMoneyToCents(v);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: `${label}: importe no válido` });
      return z.NEVER;
    }
    return cents;
  });

/** Importe opcional que admite negativos (p. ej. pérdidas como base de un variable). */
export const optionalSignedMoneyCents = (label: string) =>
  z.string().trim().transform((v, ctx) => {
    if (v === "") return null;
    const negative = /^-/.test(v);
    const cents = parseMoneyToCents(negative ? v.slice(1) : v);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: `${label}: importe no válido` });
      return z.NEVER;
    }
    return negative ? -cents : cents;
  });

/** Porcentaje opcional mayor que 0 y hasta 100, con 2 decimales como máximo. */
export const optionalPercent = (label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const n = Number(v.replace("%", "").replace(",", ".").trim());
      if (!Number.isFinite(n) || n <= 0 || n > 100 || Math.abs(Math.round(n * 100) - n * 100) > 1e-6) {
        ctx.addIssue({ code: "custom", message: `${label}: porcentaje no válido (mayor que 0 y hasta 100)` });
        return z.NEVER;
      }
      return n;
    });

/** Porcentaje de impuesto opcional (0–100, 2 decimales). Nunca se aplica por defecto. */
export const optionalTaxRate = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100 || Math.round(n * 100) !== n * 100) {
      ctx.addIssue({ code: "custom", message: "Impuesto: porcentaje no válido" });
      return z.NEVER;
    }
    return n;
  });

export const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Moneda no válida (código ISO de 3 letras)");

export const entityCode = z
  .string()
  .trim()
  .max(40)
  .refine((v) => v === "" || /^[A-Za-z0-9._-]+$/.test(v), "Código: solo letras, números, punto, guion y guion bajo")
  .transform((v) => (v === "" ? null : v));

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
