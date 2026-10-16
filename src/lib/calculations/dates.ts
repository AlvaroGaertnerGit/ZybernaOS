/**
 * Fechas de calendario sin hora ("YYYY-MM-DD"), tratadas en UTC para evitar
 * desplazamientos por zona horaria.
 */

export type IsoDate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: string): boolean {
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function toIsoDate(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function parseIso(s: IsoDate): Date {
  const m = ISO_RE.exec(s);
  if (!m) throw new Error(`Fecha no válida: ${s}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

/** Hoy en la zona horaria de la agencia (Europe/Madrid). */
export function todayIso(timeZone = "Europe/Madrid", now = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Suma meses conservando el día cuando es posible y ajustando a fin de mes
 * (31 ene + 1 mes = 28/29 feb). Se calcula siempre desde la fecha ancla para
 * no arrastrar el recorte (31 ene + 2 meses = 31 mar).
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = parseIso(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const targetY = y + Math.floor(m / 12);
  const targetM = ((m % 12) + 12) % 12;
  const day = Math.min(d.getUTCDate(), daysInMonth(targetY, targetM));
  return toIsoDate(new Date(Date.UTC(targetY, targetM, day)));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = parseIso(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((parseIso(a).getTime() - parseIso(b).getTime()) / 86_400_000);
}

export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: IsoDate): IsoDate {
  const d = parseIso(startOfMonth(date));
  return toIsoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** Convierte un valor de celda de Excel (Date, número de serie o texto) a IsoDate. */
export function parseFlexibleDate(input: unknown): IsoDate | null {
  if (input === null || input === undefined || input === "") return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    // ExcelJS devuelve las fechas como medianoche UTC.
    return toIsoDate(input);
  }
  if (typeof input === "number") {
    // Número de serie de Excel (sistema 1900).
    if (input < 1 || input > 2_958_465) return null;
    const ms = Math.round((input - 25569) * 86_400_000);
    return toIsoDate(new Date(ms));
  }
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (isIsoDate(s)) return s;
  const es = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (es) {
    const iso = `${es[3]}-${es[2].padStart(2, "0")}-${es[1].padStart(2, "0")}`;
    return isIsoDate(iso) ? iso : null;
  }
  return null;
}

const dateFmt = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const shortFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" });

export function formatDate(date: IsoDate | null | undefined, style: "long" | "short" = "long"): string {
  if (!date) return "—";
  const d = parseIso(date.slice(0, 10));
  return (style === "short" ? shortFmt : dateFmt).format(d).replace(".", "");
}

export function formatMonth(date: IsoDate): string {
  return monthFmt.format(parseIso(date)).replace(".", "");
}

export function formatRelativeDays(date: IsoDate, today: IsoDate): string {
  const d = diffDays(date, today);
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  if (d === -1) return "ayer";
  return d > 0 ? `en ${d} días` : `hace ${-d} días`;
}
