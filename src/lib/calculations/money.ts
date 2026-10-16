/**
 * Importes monetarios en céntimos enteros. Nunca se opera con coma flotante sobre
 * importes: la conversión desde texto se hace por manipulación de cadenas.
 */

export type Cents = number;

const MAX_CENTS = 99_999_999_999; // 999.999.999,99

/**
 * Convierte una entrada de usuario o de Excel a céntimos.
 * Acepta "1200", "1200.5", "1.200,50", "1,200.50", "€ 300", 300, 299.99.
 * Devuelve null si el valor no es un importe válido (negativo, >2 decimales, etc.).
 */
export function parseMoneyToCents(input: unknown): Cents | null {
  if (input === null || input === undefined) return null;

  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) return null;
    // Los números de Excel llegan como double: se redondea a céntimo y se
    // rechaza si había más de 2 decimales significativos.
    const cents = Math.round(input * 100);
    if (Math.abs(cents - input * 100) > 1e-6 * Math.max(1, Math.abs(input * 100))) return null;
    return cents <= MAX_CENTS ? cents : null;
  }

  if (typeof input !== "string") return null;
  const s = input.trim().replace(/[€\s]|EUR/gi, "");
  if (s === "" || s.startsWith("-")) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let decimalSep: "," | "." | null = null;
  if (lastComma >= 0 && lastDot >= 0) {
    // El separador que aparece último es el decimal.
    decimalSep = lastComma > lastDot ? "," : ".";
  } else if (lastComma >= 0) {
    // "300,50" decimal; "1,200" miles.
    const commas = s.split(",").length - 1;
    decimalSep = commas === 1 && s.length - lastComma - 1 <= 2 ? "," : null;
  } else if (lastDot >= 0) {
    // "300.5" decimal; "1.200" o "1.200.000" miles.
    const dots = s.split(".").length - 1;
    decimalSep = dots === 1 && s.length - lastDot - 1 !== 3 ? "." : null;
  }
  const thousandSep = decimalSep === "," ? "." : decimalSep === "." ? "," : lastComma >= 0 ? "," : ".";

  let intPart = s;
  let decPart = "";
  if (decimalSep) {
    const at = s.lastIndexOf(decimalSep);
    intPart = s.slice(0, at);
    decPart = s.slice(at + 1);
    if (!/^\d{1,2}$/.test(decPart)) return null;
  }
  if (intPart.includes(thousandSep)) {
    // Los separadores de miles deben agrupar exactamente 3 dígitos.
    const grouped = thousandSep === "." ? /^\d{1,3}(\.\d{3})+$/ : /^\d{1,3}(,\d{3})+$/;
    if (!grouped.test(intPart)) return null;
    intPart = intPart.split(thousandSep).join("");
  }
  if (!/^\d+$/.test(intPart)) return null;
  const units = intPart.replace(/^0+(?=\d)/, "");
  if (units.length > 12) return null;
  const cents = Number(units) * 100 + Number(decPart.padEnd(2, "0"));
  return cents <= MAX_CENTS ? cents : null;
}

/** Céntimos → "1234.50" (formato neutro para inputs). */
export function centsToInputString(cents: Cents | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const units = Math.floor(abs / 100);
  const dec = String(abs % 100).padStart(2, "0");
  return `${sign}${units}.${dec}`;
}

/** Céntimos → número en unidades (solo para presentación / Excel). */
export function centsToUnits(cents: Cents): number {
  return cents / 100;
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  cents: Cents | null | undefined,
  currency = "EUR",
  opts: { compact?: boolean; decimals?: boolean } = {},
): string {
  if (cents === null || cents === undefined) return "—";
  const decimals = opts.decimals ?? cents % 100 !== 0;
  const key = `${currency}|${opts.compact ? 1 : 0}|${decimals ? 1 : 0}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      notation: opts.compact ? "compact" : "standard",
      minimumFractionDigits: decimals && !opts.compact ? 2 : 0,
      maximumFractionDigits: opts.compact ? 1 : decimals ? 2 : 0,
      useGrouping: "always",
    });
    formatters.set(key, fmt);
  }
  return fmt.format(cents / 100);
}

/**
 * Base imponible + impuesto (si se ha configurado) → total.
 * El impuesto se redondea al céntimo (half-up). taxRate en porcentaje (21 = 21 %).
 */
export function computeTax(baseCents: Cents, taxRate: number | null | undefined) {
  if (taxRate === null || taxRate === undefined) {
    return { base: baseCents, tax: null as Cents | null, total: baseCents };
  }
  // taxRate puede tener 2 decimales: se trabaja en centésimas de punto porcentual.
  const rateBp = Math.round(taxRate * 100); // 21.00 → 2100
  const tax = Math.round((baseCents * rateBp) / 10_000);
  return { base: baseCents, tax, total: baseCents + tax };
}

export function sumCents(values: readonly (Cents | null | undefined)[]): Cents {
  let total = 0;
  for (const v of values) total += v ?? 0;
  return total;
}
