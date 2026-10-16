/**
 * Procesamiento de Excel en el navegador (ExcelJS). Se carga con `import()` dinámico solo
 * al descargar o al elegir un archivo, para no engordar el resto de la app.
 *
 * El servidor nunca descomprime ni genera .xlsx: entrega y recibe JSON. Así el Worker se
 * mantiene dentro de los 10 ms de CPU de Workers Free y no procesa archivos subidos.
 */
import { checkXlsxBuffer, parseWorkbook } from "./parse";
import { validateWorkbook, type ImportContext, type ImportMode, type ValidationResult } from "./validate";
import { buildWorkbook, templateExamples, type SheetRows } from "./workbook";
import type { SheetKey } from "./schema";

type Categories = { slug: string; name: string }[];
type DownloadPayload =
  | { kind: "template"; fileName: string; categories: Categories }
  | { kind: "export"; fileName: string; sheets: SheetKey[]; rows: SheetRows; categories: Categories };

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !json) throw new Error(json?.error ?? "No se pudo conectar con el servidor.");
  return json;
}

function saveFile(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Pide los datos (plantilla o exportación) al servidor y genera el .xlsx en el navegador. */
export async function downloadWorkbook(url: string) {
  const data = await getJson<DownloadPayload>(url);
  const bytes =
    data.kind === "template"
      ? await buildWorkbook({ rows: templateExamples(), categories: data.categories, withInstructions: true })
      : await buildWorkbook({ rows: data.rows, categories: data.categories, withInstructions: false, sheets: data.sheets });
  saveFile(bytes, data.fileName);
}

export interface Issue {
  sheet: string;
  row?: number;
  column?: string;
  message: string;
}

export interface FileAnalysis {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  plan: ValidationResult["plan"] | null;
  preview: ValidationResult["preview"] | null;
  /** Lo que se envía al servidor al confirmar (filas leídas, sin fórmulas ni archivo). */
  submission: { file_name: string; file_sha256: string; sheets: Awaited<ReturnType<typeof parseWorkbook>>["sheets"] } | null;
}

let contextPromise: Promise<ImportContext> | null = null;

/** Lee y valida el archivo en el navegador. El contexto (códigos existentes…) se pide una vez. */
export async function analyzeFile(file: File, mode: ImportMode, { refreshContext = false } = {}): Promise<FileAnalysis> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const problem = checkXlsxBuffer(bytes);
  if (problem) return { ok: false, errors: [{ sheet: "—", message: problem }], warnings: [], plan: null, preview: null, submission: null };

  if (refreshContext || !contextPromise) {
    contextPromise = getJson<ImportContext>("/api/excel/import");
    contextPromise.catch(() => (contextPromise = null));
  }
  const [parsed, ctx, digest] = await Promise.all([parseWorkbook(bytes), contextPromise, crypto.subtle.digest("SHA-256", bytes)]);
  const sha = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");

  const result = parsed.errors.length ? null : validateWorkbook(parsed.sheets, ctx, mode);
  const errors = [...parsed.errors, ...(result?.errors ?? [])];
  const warnings = [...parsed.warnings, ...(result?.warnings ?? [])];
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    plan: result?.plan ?? null,
    preview: result?.preview ?? null,
    submission: errors.length === 0 ? { file_name: file.name, file_sha256: sha, sheets: parsed.sheets } : null,
  };
}

/** Envía las filas validadas. El servidor vuelve a validar e importa en una transacción. */
export async function commitImport(submission: NonNullable<FileAnalysis["submission"]>, mode: ImportMode, confirmUpdate: boolean) {
  const res = await fetch("/api/excel/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...submission, mode, confirm_update: confirmUpdate }),
  });
  const json = (await res.json().catch(() => null)) as {
    ok: boolean;
    stage?: string;
    error?: string;
    errors?: Issue[];
    errorCount?: number;
    warnings?: Issue[];
    result?: Record<string, { created?: number; updated?: number; skipped?: number }>;
  } | null;
  contextPromise = null; // tras importar (o fallar), la próxima validación usa el estado nuevo de la BD
  if (!json) throw new Error("No se pudo conectar con el servidor.");
  return json;
}
