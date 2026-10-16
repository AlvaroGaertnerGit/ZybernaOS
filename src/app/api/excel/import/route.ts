import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getMember } from "@/server/auth";
import { createClient } from "@/lib/supabase/server";
import { importContext } from "@/server/queries/excel";
import { checkXlsxBuffer, parseWorkbook } from "@/lib/excel/parse";
import { validateWorkbook, type ImportMode } from "@/lib/excel/validate";
import { IMPORT_LIMITS } from "@/lib/excel/schema";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ISSUES = 300;

/**
 * POST multipart: file (.xlsx), mode ("skip" | "update"), action ("analyze" | "commit").
 * analyze → valida y devuelve la previsualización. commit → vuelve a validar en
 * servidor (no confía en el análisis previo) e importa en una única transacción.
 */
export async function POST(request: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "Tu sesión ha caducado." }, { status: 401 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > IMPORT_LIMITS.maxBytes + 64 * 1024) {
    return NextResponse.json({ error: "El archivo supera el tamaño máximo de 4 MB." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  }
  const file = form.get("file");
  const mode: ImportMode = form.get("mode") === "update" ? "update" : "skip";
  const action = form.get("action") === "commit" ? "commit" : "analyze";
  const confirmUpdate = form.get("confirm_update") === "yes";
  if (!(file instanceof File)) return NextResponse.json({ error: "Adjunta un archivo .xlsx." }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const problem = checkXlsxBuffer(buf);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const sha256 = createHash("sha256").update(buf).digest("hex");

  const parsed = await parseWorkbook(buf);
  const supabase = await createClient();
  const ctx = await importContext(supabase);
  const result = parsed.errors.length
    ? null
    : validateWorkbook(parsed.sheets, ctx, mode);

  const errors = [...parsed.errors, ...(result?.errors ?? [])];
  const warnings = [...parsed.warnings, ...(result?.warnings ?? [])];
  const summary = {
    errors: errors.slice(0, MAX_ISSUES),
    errorCount: errors.length,
    warnings: warnings.slice(0, MAX_ISSUES),
    warningCount: warnings.length,
    plan: result?.plan ?? null,
    preview: result
      ? {
          clients: result.preview.clients.slice(0, 50),
          contracts: result.preview.contracts.slice(0, 50),
          payments: result.preview.payments.slice(0, 50),
        }
      : null,
    sha256,
  };

  if (action === "analyze" || errors.length > 0 || !result) {
    return NextResponse.json({ ok: errors.length === 0, stage: "analyzed", ...summary });
  }

  if (mode === "update" && !confirmUpdate) {
    return NextResponse.json({ error: "Confirma explícitamente la actualización de registros existentes." }, { status: 400 });
  }

  // Nombre del archivo solo como metadato (saneado), nunca como ruta ni para decidir el formato.
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const { data, error } = await supabase.rpc("import_workbook", {
    p_payload: result.payload as unknown as Json,
    p_mode: mode,
    p_file_name: safeName,
    p_file_sha256: sha256,
  });
  if (error) {
    console.error("[import]", error.code, error.message);
    const message =
      error.code === "P0001" ? error.message : error.code === "23505" ? "Conflicto de códigos duplicados. Vuelve a analizar el archivo." : "La importación no se completó. No se ha guardado ningún dato.";
    return NextResponse.json({ ok: false, stage: "failed", error: message, ...summary }, { status: 422 });
  }
  return NextResponse.json({ ok: true, stage: "imported", result: data, ...summary });
}
