import "server-only";

import ExcelJS from "exceljs";
import { IMPORT_LIMITS, SHEETS, SHEET_ORDER, unsanitizeCellText, type SheetKey } from "./schema";

export type RawValue = string | number | boolean | Date | null;

export interface RawRow {
  /** Número de fila en Excel (1 = cabecera). */
  row: number;
  values: Record<string, RawValue>;
}

export interface ParseIssue {
  sheet: string;
  row?: number;
  column?: string;
  message: string;
}

export interface ParsedWorkbook {
  sheets: Partial<Record<SheetKey, RawRow[]>>;
  errors: ParseIssue[];
  warnings: ParseIssue[];
}

/** Comprueba la firma ZIP de un .xlsx y rechaza libros con macros. No confía en el nombre ni en el MIME. */
export function checkXlsxBuffer(buf: Buffer): string | null {
  if (buf.length === 0) return "El archivo está vacío.";
  if (buf.length > IMPORT_LIMITS.maxBytes) return `El archivo supera el máximo de ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB.`;
  if (buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
    return "Formato no admitido. Sube un libro de Excel .xlsx (los .xls y .csv no se admiten).";
  }
  if (buf.includes("xl/vbaProject.bin")) return "El libro contiene macros. Guárdalo como .xlsx sin macros y vuelve a subirlo.";
  return null;
}

/**
 * Lee el libro sin evaluar fórmulas: una celda con fórmula se rechaza (se pide pegar valores).
 * Devuelve las filas no vacías de cada hoja conocida con su número de fila real.
 */
export async function parseWorkbook(buf: Buffer): Promise<ParsedWorkbook> {
  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    return { sheets: {}, errors: [{ sheet: "—", message: "No se pudo leer el archivo. ¿Está dañado o protegido con contraseña?" }], warnings };
  }

  const sheets: ParsedWorkbook["sheets"] = {};
  let total = 0;

  for (const key of SHEET_ORDER) {
    const def = SHEETS[key];
    const ws = wb.worksheets.find((w) => w.name.trim().toUpperCase() === def.name);
    if (!ws) {
      if (key === "clients") errors.push({ sheet: def.name, message: `Falta la hoja ${def.name}.` });
      else warnings.push({ sheet: def.name, message: `No se encontró la hoja ${def.name}; se omite.` });
      continue;
    }

    // Cabecera → índice de columna
    const header = ws.getRow(1);
    const colIndex = new Map<string, number>();
    header.eachCell({ includeEmpty: false }, (cell, col) => {
      const name = cellToText(cell.value)?.trim().toLowerCase().replace(/\s+/g, "_");
      if (name) colIndex.set(name, col);
    });
    const known = new Set<string>(def.columns.map((c) => c.key));
    for (const c of def.columns) {
      if ("required" in c && c.required && !colIndex.has(c.key)) {
        errors.push({ sheet: def.name, row: 1, column: c.key, message: `Falta la columna obligatoria «${c.key}».` });
      }
    }
    for (const name of colIndex.keys()) {
      if (!known.has(name)) warnings.push({ sheet: def.name, row: 1, column: name, message: `Columna desconocida «${name}»; se ignora.` });
    }
    if (errors.some((e) => e.sheet === def.name)) continue;

    const rows: RawRow[] = [];
    const lastRow = ws.actualRowCount > 0 ? ws.rowCount : 1;
    for (let r = 2; r <= lastRow; r++) {
      const row = ws.getRow(r);
      if (!row.hasValues) continue;
      const values: Record<string, RawValue> = {};
      let any = false;
      for (const c of def.columns) {
        const col = colIndex.get(c.key);
        if (!col) {
          values[c.key] = null;
          continue;
        }
        const cell = row.getCell(col);
        const v = cell.value;
        if (v && typeof v === "object" && ("formula" in v || "sharedFormula" in v)) {
          errors.push({ sheet: def.name, row: r, column: c.key, message: "La celda contiene una fórmula. Copia y pega solo los valores." });
          values[c.key] = null;
          continue;
        }
        if (v && typeof v === "object" && "error" in v) {
          errors.push({ sheet: def.name, row: r, column: c.key, message: `La celda contiene un error de Excel (${String(v.error)}).` });
          values[c.key] = null;
          continue;
        }
        const normalized = normalizeCell(v);
        if (normalized !== null && normalized !== "") any = true;
        values[c.key] = normalized;
      }
      if (!any) continue;
      rows.push({ row: r, values });
      if (rows.length > IMPORT_LIMITS.maxRowsPerSheet) {
        errors.push({ sheet: def.name, message: `La hoja supera el máximo de ${IMPORT_LIMITS.maxRowsPerSheet} filas.` });
        break;
      }
    }
    total += rows.length;
    sheets[key] = rows;
  }

  if (total > IMPORT_LIMITS.maxTotalRows) {
    errors.push({ sheet: "—", message: `El libro supera el máximo de ${IMPORT_LIMITS.maxTotalRows} filas en total.` });
  }
  return { sheets, errors, warnings };
}

function cellToText(v: ExcelJS.CellValue): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "richText" in v) return v.richText.map((t) => t.text).join("");
  if (typeof v === "object" && "text" in v) return String(v.text);
  return null;
}

function normalizeCell(v: ExcelJS.CellValue): RawValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v;
  const text = cellToText(v);
  if (text === null) return null;
  const trimmed = unsanitizeCellText(text.trim());
  return trimmed === "" ? null : trimmed;
}
