import ExcelJS from "exceljs";
import { brand } from "@/config/brand";
import { isIsoDate, parseIso } from "@/lib/calculations/dates";
import { EXAMPLE_PREFIX, LISTS, SHEETS, SHEET_ORDER, sanitizeCellText, type SheetColumn, type SheetKey } from "./schema";

// Paleta del libro (formato de archivo, no UI): tonos neutros del sistema visual.
const INK = "FF1F2130";
const PAPER = "FFF5F5F8";
const HAIR = "FFDCDDE3";
const MUTED = "FF6B6F7B";

export type CellInput = string | number | Date | null | undefined;
export type SheetRows = Partial<Record<SheetKey, Record<string, CellInput>[]>>;

const VALIDATION_ROWS = 500;

function isoToExcelDate(iso: string): Date {
  // Medianoche UTC: Excel muestra el mismo día sin desplazamiento de zona.
  return parseIso(iso.slice(0, 10));
}

/**
 * Construye un libro con el esquema de Zyberna. `rows` usa importes ya en unidades
 * (no céntimos) y fechas ISO. Todo el texto se sanea frente a inyección de fórmulas.
 */
export async function buildWorkbook({
  rows,
  categories,
  withInstructions,
  sheets = SHEET_ORDER,
}: {
  rows: SheetRows;
  categories: { slug: string; name: string }[];
  withInstructions: boolean;
  sheets?: SheetKey[];
}): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = `${brand.name} ${brand.product}`;
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = false;

  if (withInstructions) addInstructions(wb);

  // CATALOGOS va al final pero las validaciones la referencian por nombre.
  const listRanges = catalogRanges(categories);

  for (const key of sheets) {
    const def = SHEETS[key];
    const ws = wb.addWorksheet(def.name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = def.columns.map((c) => ({ header: c.key, key: c.key, width: c.width }));
    styleHeader(ws, def.columns);

    for (const r of rows[key] ?? []) {
      const added = ws.addRow(def.columns.map((c) => toCell(c, r[c.key])));
      added.eachCell((cell, col) => applyFormat(cell, def.columns[col - 1]));
    }

    // Formato y validaciones para filas nuevas que añada el usuario.
    const firstEmpty = (rows[key]?.length ?? 0) + 2;
    const last = Math.max(firstEmpty + 50, VALIDATION_ROWS);
    def.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.kind === "money") col.numFmt = "#,##0.00";
      if (c.kind === "date") col.numFmt = "dd/mm/yyyy";
      if (c.kind === "percent") col.numFmt = "0.00";
      const list = "list" in c ? c.list : undefined;
      // Las validaciones solo se añaden a la plantilla (mantiene ligeros los libros exportados).
      if (!withInstructions || (!list && c.kind !== "date" && c.kind !== "money")) return;
      for (let r = 2; r <= last; r++) {
        const cell = ws.getCell(r, i + 1);
        if (list) {
          cell.dataValidation = {
            type: "list",
            allowBlank: !("required" in c && c.required),
            formulae: [listRanges[list]],
            showErrorMessage: true,
            errorTitle: "Valor no válido",
            error: `Elige un valor de la lista (hoja CATALOGOS).`,
          };
        } else if (c.kind === "date") {
          cell.dataValidation = {
            type: "date",
            operator: "greaterThan",
            allowBlank: true,
            formulae: [new Date(Date.UTC(1990, 0, 1))],
            showErrorMessage: true,
            errorTitle: "Fecha no válida",
            error: "Introduce una fecha (dd/mm/aaaa).",
          };
        } else if (c.kind === "money") {
          cell.dataValidation = {
            type: "decimal",
            operator: "greaterThanOrEqual",
            allowBlank: true,
            formulae: [0],
            showErrorMessage: true,
            errorTitle: "Importe no válido",
            error: "Introduce un importe positivo con hasta 2 decimales.",
          };
        }
      }
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: def.columns.length } };
  }

  addCatalogs(wb, categories);
  const out = await wb.xlsx.writeBuffer();
  return new Uint8Array(out as ArrayBuffer);
}

function toCell(c: SheetColumn, v: CellInput): ExcelJS.CellValue {
  if (v === null || v === undefined || v === "") return null;
  if (c.kind === "date" && typeof v === "string" && isIsoDate(v.slice(0, 10))) return isoToExcelDate(v);
  if ((c.kind === "money" || c.kind === "percent" || c.kind === "integer") && typeof v === "number") return v;
  if (typeof v === "string") return sanitizeCellText(v);
  return v;
}

function applyFormat(cell: ExcelJS.Cell, c: SheetColumn | undefined) {
  if (!c) return;
  if (c.kind === "money") cell.numFmt = "#,##0.00";
  if (c.kind === "date") cell.numFmt = "dd/mm/yyyy";
  cell.alignment = { vertical: "middle" };
}

function styleHeader(ws: ExcelJS.Worksheet, columns: readonly SheetColumn[]) {
  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((cell, col) => {
    const c = columns[col - 1];
    const required = c && "required" in c && c.required;
    cell.font = { bold: true, color: { argb: required ? "FFFFFFFF" : INK }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: required ? INK : PAPER } };
    cell.alignment = { vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: HAIR } } };
    if (c) cell.note = { texts: [{ text: `${required ? "Obligatorio. " : ""}${c.description}` }] };
  });
}

function catalogRanges(categories: { slug: string; name: string }[]): Record<string, string> {
  const ranges: Record<string, string> = {};
  const names = ["categorias", ...Object.keys(LISTS)];
  names.forEach((name, i) => {
    const colLetter = String.fromCharCode(65 + i);
    const len = name === "categorias" ? categories.length : LISTS[name as keyof typeof LISTS].length;
    ranges[name] = `CATALOGOS!$${colLetter}$2:$${colLetter}$${Math.max(len + 1, 2)}`;
  });
  return ranges;
}

function addCatalogs(wb: ExcelJS.Workbook, categories: { slug: string; name: string }[]) {
  const ws = wb.addWorksheet("CATALOGOS");
  const lists: [string, readonly string[]][] = [["categorias", categories.map((c) => c.slug)], ...Object.entries(LISTS)];
  lists.forEach(([name, values], i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(16, name.length + 4);
    const head = ws.getCell(1, i + 1);
    head.value = name;
    head.font = { bold: true, size: 10, color: { argb: INK } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAPER } };
    values.forEach((v, r) => {
      ws.getCell(r + 2, i + 1).value = v;
    });
  });
  // Leyenda de categorías (slug → nombre)
  const legendCol = lists.length + 2;
  ws.getColumn(legendCol).width = 18;
  ws.getColumn(legendCol + 1).width = 28;
  ws.getCell(1, legendCol).value = "categoria (código)";
  ws.getCell(1, legendCol + 1).value = "nombre";
  [ws.getCell(1, legendCol), ws.getCell(1, legendCol + 1)].forEach((c) => {
    c.font = { bold: true, size: 10, color: { argb: INK } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAPER } };
  });
  categories.forEach((c, r) => {
    ws.getCell(r + 2, legendCol).value = c.slug;
    ws.getCell(r + 2, legendCol + 1).value = c.name;
  });
  ws.state = "visible";
}

function addInstructions(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("INSTRUCCIONES", { views: [{ showGridLines: false }] });
  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 110;
  const lines: [string, "title" | "h" | "p" | "muted"][] = [
    [`${brand.name.toUpperCase()} · Plantilla de importación de clientes`, "title"],
    ["Rellena las hojas CLIENTES, CONTRATACIONES, PRESTACIONES y COBROS. Solo CLIENTES es imprescindible.", "p"],
    ["", "p"],
    ["Cómo se relacionan las hojas", "h"],
    ["• Cada cliente tiene un codigo_cliente único (ej. CLI-0001). Las contrataciones y cobros lo usan para enlazarse.", "p"],
    ["• Cada contratación tiene un codigo_contratacion único (ej. CON-0001). PRESTACIONES y COBROS lo usan para enlazarse.", "p"],
    ["• Puedes referenciar clientes o contrataciones que ya existan en la aplicación usando su código.", "p"],
    ["", "p"],
    ["Reglas", "h"],
    ["• Las columnas con cabecera oscura son obligatorias. Pasa el ratón sobre cada cabecera para ver su descripción.", "p"],
    ["• Fechas en formato dd/mm/aaaa. Importes con hasta 2 decimales, sin símbolo de moneda y sin impuestos.", "p"],
    ["• Los valores de estado, tipo de cobro, periodicidad, categoría y moneda deben elegirse de la lista (hoja CATALOGOS).", "p"],
    ["• Periodicidad «personalizada»: indica intervalo_cada (número) e intervalo_unidad (dias, semanas, meses o anos).", "p"],
    ["• El impuesto (impuesto_pct) es opcional. Si se deja vacío, no se aplica ningún impuesto.", "p"],
    ["• En COBROS, el estado se calcula a partir de los importes; solo «anulado» se aplica tal cual.", "p"],
    ["• No uses fórmulas: si copias datos, pega solo los valores. Las celdas con fórmulas se rechazan.", "p"],
    ["", "p"],
    ["Reimportación y duplicados", "h"],
    ["• Los códigos identifican los registros. Si un código ya existe, por defecto NO se modifica.", "p"],
    ["• En el asistente puedes elegir actualizar los existentes; requiere confirmación explícita.", "p"],
    ["• La importación es transaccional: si una fila falla, no se guarda nada.", "p"],
    ["", "p"],
    [`Las filas de ejemplo usan códigos que empiezan por «${EXAMPLE_PREFIX}» y se ignoran al importar. Puedes borrarlas.`, "muted"],
    ["Límites: 4 MB por archivo y 5.000 filas por hoja.", "muted"],
  ];
  lines.forEach(([t, kind], i) => {
    const cell = ws.getCell(i + 2, 2);
    cell.value = t;
    cell.alignment = { wrapText: true, vertical: "top" };
    if (kind === "title") cell.font = { bold: true, size: 15, color: { argb: INK } };
    if (kind === "h") cell.font = { bold: true, size: 11, color: { argb: INK } };
    if (kind === "p") cell.font = { size: 10, color: { argb: INK } };
    if (kind === "muted") cell.font = { size: 9, italic: true, color: { argb: MUTED } };
    if (kind === "title") ws.getRow(i + 2).height = 26;
  });
}

/** Filas de ejemplo ficticias para la plantilla (se ignoran al importar). */
export function templateExamples(): SheetRows {
  return {
    clients: [
      {
        codigo_cliente: `${EXAMPLE_PREFIX}CLI-1`,
        nombre_comercial: "Restaurante Ejemplo",
        razon_social: "Ejemplo Restauración S.L.",
        cif_nif: "B00000000",
        contacto: "Ana Ejemplo",
        email: "ana@ejemplo.test",
        telefono: "+34 600 000 000",
        web: "ejemplo.test",
        sector: "Restauración",
        estado: "activo",
        responsable: "",
        fecha_alta: "2026-01-15",
        notas: "Cliente ficticio de ejemplo",
      },
      {
        codigo_cliente: `${EXAMPLE_PREFIX}CLI-2`,
        nombre_comercial: "Clínica Ejemplo",
        contacto: "Luis Ejemplo",
        email: "luis@ejemplo.test",
        estado: "negociacion",
        fecha_alta: "2026-03-01",
      },
    ],
    contracts: [
      {
        codigo_contratacion: `${EXAMPLE_PREFIX}CON-1`,
        codigo_cliente: `${EXAMPLE_PREFIX}CLI-1`,
        categoria: "seo",
        servicio: "SEO mensual",
        nombre_plan: "Gestión SEO",
        precio: 450,
        moneda: "EUR",
        tipo_cobro: "recurrente",
        periodicidad: "mensual",
        fecha_inicio: "2026-02-01",
        estado: "activo",
      },
      {
        codigo_contratacion: `${EXAMPLE_PREFIX}CON-2`,
        codigo_cliente: `${EXAMPLE_PREFIX}CLI-1`,
        categoria: "web",
        servicio: "Web corporativa",
        nombre_plan: "Rediseño web",
        precio: 2400,
        impuesto_pct: 21,
        moneda: "EUR",
        tipo_cobro: "unico",
        fecha_inicio: "2026-02-01",
        estado: "activo",
      },
      {
        codigo_contratacion: `${EXAMPLE_PREFIX}CON-3`,
        codigo_cliente: `${EXAMPLE_PREFIX}CLI-1`,
        categoria: "social",
        nombre_plan: "Reels bimestrales",
        precio: 300,
        tipo_cobro: "recurrente",
        periodicidad: "personalizada",
        intervalo_cada: 2,
        intervalo_unidad: "meses",
        fecha_inicio: "2026-02-01",
        estado: "activo",
      },
    ],
    deliverables: [
      { codigo_contratacion: `${EXAMPLE_PREFIX}CON-1`, orden: 1, prestacion: "Auditoría técnica inicial" },
      { codigo_contratacion: `${EXAMPLE_PREFIX}CON-1`, orden: 2, prestacion: "Optimización de páginas" },
      { codigo_contratacion: `${EXAMPLE_PREFIX}CON-1`, orden: 3, prestacion: "Informe mensual" },
    ],
    payments: [
      {
        codigo_cobro: `${EXAMPLE_PREFIX}COB-1`,
        codigo_cliente: `${EXAMPLE_PREFIX}CLI-1`,
        codigo_contratacion: `${EXAMPLE_PREFIX}CON-1`,
        concepto: "Gestión SEO · febrero",
        importe: 450,
        fecha_vencimiento: "2026-02-05",
        estado: "cobrado",
        fecha_cobro: "2026-02-04",
        importe_cobrado: 450,
      },
      {
        codigo_cobro: `${EXAMPLE_PREFIX}COB-2`,
        codigo_cliente: `${EXAMPLE_PREFIX}CLI-1`,
        codigo_contratacion: `${EXAMPLE_PREFIX}CON-2`,
        concepto: "Rediseño web · 50 % inicial",
        importe: 1200,
        impuesto_pct: 21,
        fecha_vencimiento: "2026-02-10",
        estado: "parcial",
        fecha_cobro: "2026-02-12",
        importe_cobrado: 600,
        referencia_factura: "F-EJ-001",
      },
    ],
  };
}
