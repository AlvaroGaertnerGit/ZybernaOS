/**
 * Validación de un libro importado. Función pura: recibe las filas leídas y el
 * contexto de la base de datos, y devuelve errores (hoja/fila/columna/motivo),
 * avisos, el plan (crear / actualizar / omitir) y el payload para import_workbook().
 */

import {
  BILLING_TYPE_META,
  CLIENT_STATUS_META,
  CONTRACT_STATUS_META,
  INTERVAL_UNIT_META,
  PAYMENT_STATUS_META,
  PERIODICITY_META,
  fromExcelValue,
  normalizeToken,
  type BillingType,
  type ClientStatus,
  type ContractStatus,
  type IntervalUnit,
  type Periodicity,
} from "@/lib/domain";
import { parseMoneyToCents } from "@/lib/calculations/money";
import { parseFlexibleDate, todayIso } from "@/lib/calculations/dates";
import { EXAMPLE_PREFIX, SHEETS, type SheetKey } from "./schema";
import type { RawRow, RawValue } from "./parse";

export interface ImportIssue {
  sheet: string;
  row?: number;
  column?: string;
  message: string;
}

export interface ImportContext {
  categories: { id: string; slug: string; name: string }[];
  catalog: { id: string; category_id: string; name: string }[];
  members: { id: string; email: string; full_name: string }[];
  existingClients: { code: string; email: string | null; trade_name: string }[];
  existingContracts: { code: string; client_code: string }[];
  existingPayments: { code: string; client_code: string }[];
  today?: string;
}

export type ImportMode = "skip" | "update";

export interface ImportPayload {
  clients: Record<string, unknown>[];
  contracts: Record<string, unknown>[];
  deliverables: Record<string, unknown>[];
  payments: Record<string, unknown>[];
}

export interface PlanCounts {
  create: number;
  existing: number;
}

export interface ValidationResult {
  errors: ImportIssue[];
  warnings: ImportIssue[];
  plan: Record<"clients" | "contracts" | "deliverables" | "payments", PlanCounts>;
  payload: ImportPayload;
  preview: {
    clients: { row: number; code: string; name: string; existing: boolean }[];
    contracts: { row: number; code: string; client: string; name: string; existing: boolean }[];
    payments: { row: number; code: string; client: string; concept: string; existing: boolean }[];
  };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CODE_RE = /^[A-Za-z0-9._-]{1,40}$/;

function text(v: RawValue | undefined, max = 500): string | null {
  if (v === null || v === undefined) return null;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
  return s === "" ? null : s.slice(0, max);
}

export function validateWorkbook(
  sheets: Partial<Record<SheetKey, RawRow[]>>,
  ctx: ImportContext,
  mode: ImportMode,
): ValidationResult {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const today = ctx.today ?? todayIso();
  const err = (sheet: SheetKey, row: number, column: string, message: string) =>
    errors.push({ sheet: SHEETS[sheet].name, row, column, message });
  const warn = (sheet: SheetKey, row: number, column: string | undefined, message: string) =>
    warnings.push({ sheet: SHEETS[sheet].name, row, column, message });

  const memberByKey = new Map<string, string>();
  for (const m of ctx.members) {
    memberByKey.set(m.email.toLowerCase(), m.id);
    if (m.full_name) memberByKey.set(normalizeToken(m.full_name), m.id);
  }
  const resolveOwner = (sheet: SheetKey, row: number, raw: RawValue | undefined): string | null => {
    const v = text(raw);
    if (!v) return null;
    const id = memberByKey.get(v.toLowerCase()) ?? memberByKey.get(normalizeToken(v));
    if (!id) warn(sheet, row, "responsable", `Responsable «${v}» no encontrado; se dejará sin asignar.`);
    return id ?? null;
  };
  const date = (sheet: SheetKey, row: number, column: string, raw: RawValue | undefined, required: boolean): string | null => {
    if (raw === null || raw === undefined || raw === "") {
      if (required) err(sheet, row, column, "Fecha obligatoria.");
      return null;
    }
    const d = parseFlexibleDate(raw);
    if (!d) err(sheet, row, column, `Fecha no válida «${text(raw)}». Usa dd/mm/aaaa.`);
    return d;
  };
  const money = (sheet: SheetKey, row: number, column: string, raw: RawValue | undefined, required: boolean): number | null => {
    if (raw === null || raw === undefined || raw === "") {
      if (required) err(sheet, row, column, "Importe obligatorio.");
      return null;
    }
    const cents = typeof raw === "number" || typeof raw === "string" ? parseMoneyToCents(raw) : null;
    if (cents === null) err(sheet, row, column, `Importe no válido «${text(raw)}». Usa números con hasta 2 decimales.`);
    return cents;
  };
  const percent = (sheet: SheetKey, row: number, raw: RawValue | undefined): number | null => {
    const v = text(raw);
    if (!v) return null;
    const n = typeof raw === "number" ? raw : Number(v.replace("%", "").replace(",", "."));
    // Si Excel guarda 21 % como 0,21, se interpreta como porcentaje.
    const pct = typeof raw === "number" && raw > 0 && raw < 1 ? Math.round(raw * 10000) / 100 : n;
    if (!Number.isFinite(pct) || pct < 0 || pct > 100 || Math.abs(pct * 100 - Math.round(pct * 100)) > 1e-6) {
      err(sheet, row, "impuesto_pct", `Porcentaje no válido «${v}».`);
      return null;
    }
    return Math.round(pct * 100) / 100;
  };
  const code = (sheet: SheetKey, row: number, column: string, raw: RawValue | undefined, required: boolean): string | null => {
    const v = text(raw, 60);
    if (!v) {
      if (required) err(sheet, row, column, "Código obligatorio.");
      return null;
    }
    if (!CODE_RE.test(v)) {
      err(sheet, row, column, `Código no válido «${v}» (solo letras, números, punto, guion y guion bajo; máx. 40).`);
      return null;
    }
    return v;
  };
  const isExample = (c: string | null) => Boolean(c && c.toUpperCase().startsWith(EXAMPLE_PREFIX));

  const existingClient = new Map(ctx.existingClients.map((c) => [c.code, c]));
  const existingContract = new Map(ctx.existingContracts.map((c) => [c.code, c]));
  const existingPayment = new Map(ctx.existingPayments.map((c) => [c.code, c]));
  const clientByEmail = new Map(ctx.existingClients.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.code]));
  const clientByName = new Map(ctx.existingClients.map((c) => [normalizeToken(c.trade_name), c.code]));

  const payload: ImportPayload = { clients: [], contracts: [], deliverables: [], payments: [] };
  const preview: ValidationResult["preview"] = { clients: [], contracts: [], payments: [] };
  const plan: ValidationResult["plan"] = {
    clients: { create: 0, existing: 0 },
    contracts: { create: 0, existing: 0 },
    deliverables: { create: 0, existing: 0 },
    payments: { create: 0, existing: 0 },
  };

  // ---------------------------------------------------------------- CLIENTES
  const fileClients = new Set<string>();
  let examplesSkipped = 0;
  for (const { row, values: v } of sheets.clients ?? []) {
    const s: SheetKey = "clients";
    const c = code(s, row, "codigo_cliente", v.codigo_cliente, true);
    if (isExample(c)) {
      examplesSkipped++;
      continue;
    }
    if (c && fileClients.has(c)) err(s, row, "codigo_cliente", `Código duplicado en el archivo: ${c}.`);
    const name = text(v.nombre_comercial, 160);
    if (!name) err(s, row, "nombre_comercial", "El nombre comercial es obligatorio.");
    const email = text(v.email, 254)?.toLowerCase() ?? null;
    if (email && !EMAIL_RE.test(email)) err(s, row, "email", `Email no válido «${email}».`);
    let status: ClientStatus = "lead";
    const rawStatus = text(v.estado);
    if (rawStatus) {
      const st = fromExcelValue(CLIENT_STATUS_META, rawStatus);
      if (!st) err(s, row, "estado", `Estado no válido «${rawStatus}». Valores: ${Object.values(CLIENT_STATUS_META).map((m) => m.excel).join(", ")}.`);
      else status = st;
    }
    const joined = date(s, row, "fecha_alta", v.fecha_alta, false) ?? today;
    const owner = resolveOwner(s, row, v.responsable);
    let website = text(v.web, 300);
    if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
    if (!c || !name) continue;
    fileClients.add(c);

    const exists = existingClient.has(c);
    if (!exists) {
      const dupe = (email && clientByEmail.get(email)) || clientByName.get(normalizeToken(name));
      if (dupe && dupe !== c) warn(s, row, "codigo_cliente", `Posible duplicado de un cliente existente (${dupe}) con el mismo nombre o email.`);
    }
    if (exists) plan.clients.existing++;
    else plan.clients.create++;
    preview.clients.push({ row, code: c, name, existing: exists });
    payload.clients.push({
      code: c,
      trade_name: name,
      legal_name: text(v.razon_social, 200),
      tax_id: text(v.cif_nif, 30),
      contact_name: text(v.contacto, 120),
      email,
      phone: text(v.telefono, 40),
      website,
      address: null,
      sector: text(v.sector, 80),
      status,
      owner_id: owner,
      joined_on: joined,
      notes: text(v.notas, 5000),
    });
  }

  const clientExists = (c: string) => fileClients.has(c) || existingClient.has(c);

  // ---------------------------------------------------------- CONTRATACIONES
  const categoryBy = new Map<string, { id: string; slug: string }>();
  for (const cat of ctx.categories) {
    categoryBy.set(normalizeToken(cat.slug), cat);
    categoryBy.set(normalizeToken(cat.name), cat);
  }
  const fileContracts = new Map<string, string>(); // code → client code
  for (const { row, values: v } of sheets.contracts ?? []) {
    const s: SheetKey = "contracts";
    const c = code(s, row, "codigo_contratacion", v.codigo_contratacion, true);
    if (isExample(c)) {
      examplesSkipped++;
      continue;
    }
    if (c && fileContracts.has(c)) err(s, row, "codigo_contratacion", `Código duplicado en el archivo: ${c}.`);
    const clientCode = code(s, row, "codigo_cliente", v.codigo_cliente, true);
    if (clientCode && !clientExists(clientCode)) err(s, row, "codigo_cliente", `El cliente ${clientCode} no existe en la hoja CLIENTES ni en la aplicación.`);
    if (c && clientCode && existingContract.has(c) && existingContract.get(c)!.client_code !== clientCode) {
      err(s, row, "codigo_cliente", `La contratación ${c} ya existe y pertenece al cliente ${existingContract.get(c)!.client_code}.`);
    }

    const rawCat = text(v.categoria);
    const category = rawCat ? categoryBy.get(normalizeToken(rawCat)) : undefined;
    if (!rawCat) err(s, row, "categoria", "La categoría es obligatoria.");
    else if (!category) err(s, row, "categoria", `Categoría desconocida «${rawCat}». Consulta la hoja CATALOGOS.`);

    const serviceName = text(v.servicio, 120);
    let serviceId: string | null = null;
    if (serviceName && category) {
      const svc = ctx.catalog.find((x) => x.category_id === category.id && normalizeToken(x.name) === normalizeToken(serviceName));
      if (svc) serviceId = svc.id;
      else warn(s, row, "servicio", `El servicio «${serviceName}» no está en el catálogo; se guardará sin vincular.`);
    }
    const name = text(v.nombre_plan, 160) ?? serviceName;
    if (!name) err(s, row, "nombre_plan", "El nombre de la contratación es obligatorio.");
    const amount = money(s, row, "precio", v.precio, true);
    const tax = percent(s, row, v.impuesto_pct);
    const currency = (text(v.moneda) ?? "EUR").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) err(s, row, "moneda", `Moneda no válida «${currency}».`);

    const rawBilling = text(v.tipo_cobro);
    let billing: BillingType | null = null;
    if (!rawBilling) err(s, row, "tipo_cobro", "Indica «unico» o «recurrente».");
    else {
      billing = fromExcelValue(BILLING_TYPE_META, rawBilling);
      if (!billing) err(s, row, "tipo_cobro", `Tipo de cobro no válido «${rawBilling}». Usa «unico» o «recurrente».`);
    }
    let periodicity: Periodicity | null = null;
    let intervalCount: number | null = null;
    let intervalUnit: IntervalUnit | null = null;
    const rawPeriod = text(v.periodicidad);
    if (billing === "recurring") {
      if (!rawPeriod) err(s, row, "periodicidad", "La periodicidad es obligatoria para cobros recurrentes.");
      else {
        periodicity = fromExcelValue(PERIODICITY_META, rawPeriod);
        if (!periodicity) err(s, row, "periodicidad", `Periodicidad no válida «${rawPeriod}». Valores: ${Object.values(PERIODICITY_META).map((m) => m.excel).join(", ")}.`);
      }
      if (periodicity === "custom") {
        const n = Number(text(v.intervalo_cada));
        if (!Number.isInteger(n) || n < 1 || n > 1000) err(s, row, "intervalo_cada", "Indica un número entero entre 1 y 1000.");
        else intervalCount = n;
        const rawUnit = text(v.intervalo_unidad);
        intervalUnit = rawUnit ? fromExcelValue(INTERVAL_UNIT_META, rawUnit) : null;
        if (!intervalUnit) err(s, row, "intervalo_unidad", "Indica la unidad: dias, semanas, meses o anos.");
      }
    } else if (billing === "one_time" && rawPeriod) {
      warn(s, row, "periodicidad", "Pago único: se ignora la periodicidad.");
    }
    const start = date(s, row, "fecha_inicio", v.fecha_inicio, true);
    const end = date(s, row, "fecha_fin", v.fecha_fin, false);
    if (start && end && end < start) err(s, row, "fecha_fin", "La fecha de finalización es anterior al inicio.");
    const renewal = date(s, row, "proxima_renovacion", v.proxima_renovacion, false);
    let status: ContractStatus = "active";
    const rawStatus = text(v.estado);
    if (rawStatus) {
      const st = fromExcelValue(CONTRACT_STATUS_META, rawStatus);
      if (!st) err(s, row, "estado", `Estado no válido «${rawStatus}».`);
      else status = st;
    }
    const owner = resolveOwner(s, row, v.responsable);
    if (!c || !clientCode) continue;
    fileContracts.set(c, clientCode);
    const exists = existingContract.has(c);
    if (exists) plan.contracts.existing++;
    else plan.contracts.create++;
    preview.contracts.push({ row, code: c, client: clientCode, name: name ?? "", existing: exists });
    payload.contracts.push({
      code: c,
      client_code: clientCode,
      category_slug: category?.slug ?? null,
      service_id: serviceId,
      name,
      description: text(v.descripcion, 2000),
      amount_cents: amount,
      tax_rate: tax,
      currency,
      billing_type: billing,
      periodicity: billing === "recurring" ? periodicity : null,
      interval_count: periodicity === "custom" ? intervalCount : null,
      interval_unit: periodicity === "custom" ? intervalUnit : null,
      start_date: start,
      end_date: end,
      next_renewal_date: billing === "recurring" ? renewal : null,
      status,
      owner_id: owner,
      notes: text(v.notas, 5000),
    });
  }
  const contractClient = (c: string) => fileContracts.get(c) ?? existingContract.get(c)?.client_code;

  // ------------------------------------------------------------ PRESTACIONES
  const positions = new Map<string, number>();
  for (const { row, values: v } of sheets.deliverables ?? []) {
    const s: SheetKey = "deliverables";
    const c = code(s, row, "codigo_contratacion", v.codigo_contratacion, true);
    if (isExample(c)) {
      examplesSkipped++;
      continue;
    }
    if (c && !contractClient(c)) err(s, row, "codigo_contratacion", `La contratación ${c} no existe en CONTRATACIONES ni en la aplicación.`);
    if (c && !fileContracts.has(c) && existingContract.has(c)) {
      warn(s, row, "codigo_contratacion", `La contratación ${c} no está en la hoja CONTRATACIONES: sus prestaciones no se modificarán.`);
    }
    const title = text(v.prestacion, 200);
    if (!title) err(s, row, "prestacion", "La prestación es obligatoria.");
    const rawOrder = text(v.orden);
    let position = rawOrder ? Number(rawOrder) : NaN;
    if (rawOrder && (!Number.isInteger(position) || position < 0)) {
      err(s, row, "orden", `Orden no válido «${rawOrder}».`);
      position = NaN;
    }
    if (!c || !title) continue;
    const next = (positions.get(c) ?? 0) + 1;
    positions.set(c, next);
    plan.deliverables.create++;
    payload.deliverables.push({
      contract_code: c,
      position: Number.isNaN(position) ? next : position,
      title,
      description: text(v.descripcion, 1000),
    });
  }

  // ------------------------------------------------------------------ COBROS
  const filePayments = new Set<string>();
  for (const { row, values: v } of sheets.payments ?? []) {
    const s: SheetKey = "payments";
    const c = code(s, row, "codigo_cobro", v.codigo_cobro, true);
    if (isExample(c)) {
      examplesSkipped++;
      continue;
    }
    if (c && filePayments.has(c)) err(s, row, "codigo_cobro", `Código duplicado en el archivo: ${c}.`);
    const clientCode = code(s, row, "codigo_cliente", v.codigo_cliente, true);
    if (clientCode && !clientExists(clientCode)) err(s, row, "codigo_cliente", `El cliente ${clientCode} no existe.`);
    if (c && clientCode && existingPayment.has(c) && existingPayment.get(c)!.client_code !== clientCode) {
      err(s, row, "codigo_cliente", `El cobro ${c} ya existe y pertenece al cliente ${existingPayment.get(c)!.client_code}.`);
    }
    const contractCode = code(s, row, "codigo_contratacion", v.codigo_contratacion, false);
    if (contractCode) {
      const owner = contractClient(contractCode);
      if (!owner) err(s, row, "codigo_contratacion", `La contratación ${contractCode} no existe.`);
      else if (clientCode && owner !== clientCode) err(s, row, "codigo_contratacion", `La contratación ${contractCode} pertenece a otro cliente (${owner}).`);
    }
    const concept = text(v.concepto, 200);
    if (!concept) err(s, row, "concepto", "El concepto es obligatorio.");
    const amount = money(s, row, "importe", v.importe, true);
    if (amount === 0) err(s, row, "importe", "El importe debe ser mayor que cero.");
    const tax = percent(s, row, v.impuesto_pct);
    const currency = (text(v.moneda) ?? "EUR").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) err(s, row, "moneda", `Moneda no válida «${currency}».`);
    const due = date(s, row, "fecha_vencimiento", v.fecha_vencimiento, true);
    let paid = money(s, row, "importe_cobrado", v.importe_cobrado, false) ?? 0;
    let paidOn = date(s, row, "fecha_cobro", v.fecha_cobro, false);

    const rawStatus = text(v.estado);
    const status = rawStatus ? fromExcelValue(PAYMENT_STATUS_META, rawStatus) : null;
    if (rawStatus && !status) err(s, row, "estado", `Estado no válido «${rawStatus}».`);
    const isVoid = status === "void";
    if (status === "paid" && paid === 0 && amount) {
      paid = amount;
      warn(s, row, "importe_cobrado", "Estado «cobrado» sin importe cobrado: se registra el importe completo.");
    }
    if (status === "partial" && paid === 0) err(s, row, "importe_cobrado", "Estado «parcial» requiere indicar el importe cobrado.");
    if (amount !== null && paid > amount) err(s, row, "importe_cobrado", "El importe cobrado supera el importe previsto.");
    if (isVoid && paid > 0) err(s, row, "estado", "Un cobro anulado no puede tener importe cobrado.");
    if (paid > 0 && !paidOn) {
      paidOn = due;
      if (due) warn(s, row, "fecha_cobro", "Sin fecha de cobro: se usa la fecha de vencimiento.");
    }
    if (!c || !clientCode) continue;
    filePayments.add(c);
    const exists = existingPayment.has(c);
    if (exists) plan.payments.existing++;
    else plan.payments.create++;
    preview.payments.push({ row, code: c, client: clientCode, concept: concept ?? "", existing: exists });
    payload.payments.push({
      code: c,
      client_code: clientCode,
      contract_code: contractCode,
      concept,
      amount_due_cents: amount,
      tax_rate: tax,
      currency,
      due_date: due,
      paid_on: paidOn,
      amount_paid_cents: paid,
      is_void: isVoid,
      invoice_ref: text(v.referencia_factura, 60),
      notes: text(v.notas, 2000),
    });
  }

  if (examplesSkipped > 0) {
    warnings.push({ sheet: "—", message: `Se omiten ${examplesSkipped} fila(s) de ejemplo (códigos que empiezan por «${EXAMPLE_PREFIX}»).` });
  }
  const totalExisting = plan.clients.existing + plan.contracts.existing + plan.payments.existing;
  if (totalExisting > 0) {
    warnings.push({
      sheet: "—",
      message:
        mode === "update"
          ? `${totalExisting} registro(s) ya existen y se ACTUALIZARÁN con los datos del archivo.`
          : `${totalExisting} registro(s) ya existen y se omitirán (no se sobrescriben sin confirmación).`,
    });
  }
  const hasData = payload.clients.length + payload.contracts.length + payload.deliverables.length + payload.payments.length > 0;
  if (!hasData && errors.length === 0) errors.push({ sheet: "—", message: "El archivo no contiene filas para importar." });

  return { errors, warnings, plan, payload, preview };
}
