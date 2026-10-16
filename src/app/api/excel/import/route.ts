import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getMember } from "@/server/auth";
import { createClient } from "@/lib/supabase/server";
import { importContext } from "@/server/queries/excel";
import { validateWorkbook } from "@/lib/excel/validate";
import { IMPORT_LIMITS, SHEET_ORDER } from "@/lib/excel/schema";
import type { Json } from "@/types/database";

export const runtime = "nodejs";

const MAX_ISSUES = 300;
/** El JSON de 15.000 filas ocupa ≈ 4,6 MB; se deja margen sobre el máximo de filas. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * GET: contexto para validar en el navegador (códigos existentes, categorías, catálogo, miembros).
 * El navegador lee el .xlsx con ExcelJS, valida y muestra la previsualización sin subir el archivo.
 */
export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "Tu sesión ha caducado." }, { status: 401 });
  try {
    const ctx = await importContext(await createClient());
    return NextResponse.json(ctx, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[import]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo preparar la validación." }, { status: 500 });
  }
}

const cell = z.union([z.string().max(5000), z.number(), z.boolean(), z.null()]);
const rawRow = z.object({ row: z.number().int().min(2).max(1_048_576), values: z.record(z.string().max(60), cell) });
const sheet = z.array(rawRow).max(IMPORT_LIMITS.maxRowsPerSheet);
const bodySchema = z.object({
  mode: z.enum(["skip", "update"]),
  confirm_update: z.boolean().optional(),
  file_name: z.string().max(255),
  file_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  sheets: z.object({
    clients: sheet.optional(),
    contracts: sheet.optional(),
    deliverables: sheet.optional(),
    payments: sheet.optional(),
  }),
});

/**
 * POST JSON: filas leídas del .xlsx en el navegador. Validación DEFINITIVA en servidor
 * (`validateWorkbook` con el contexto actual de la BD, sin fiarse del análisis del navegador)
 * e importación en una única transacción (RPC `import_workbook`, que además comprueba
 * membresía, tipos, enums, claves foráneas, unicidad y restricciones CHECK).
 */
export async function POST(request: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "Tu sesión ha caducado." }, { status: 401 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return NextResponse.json({ error: "El archivo es demasiado grande." }, { status: 413 });

  let parsedBody: z.infer<typeof bodySchema>;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "El archivo es demasiado grande." }, { status: 413 });
    const result = bodySchema.safeParse(JSON.parse(text));
    if (!result.success) return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
    parsedBody = result.data;
  } catch {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  }
  const { mode, sheets } = parsedBody;
  const total = SHEET_ORDER.reduce((acc, k) => acc + (sheets[k]?.length ?? 0), 0);
  if (total > IMPORT_LIMITS.maxTotalRows) {
    return NextResponse.json({ error: `El libro supera el máximo de ${IMPORT_LIMITS.maxTotalRows} filas en total.` }, { status: 400 });
  }
  if (mode === "update" && !parsedBody.confirm_update) {
    return NextResponse.json({ error: "Confirma explícitamente la actualización de registros existentes." }, { status: 400 });
  }

  const supabase = await createClient();
  let result;
  try {
    result = validateWorkbook(sheets, await importContext(supabase), mode);
  } catch (e) {
    console.error("[import]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, stage: "failed", error: "No se pudo validar el archivo." }, { status: 500 });
  }
  if (result.errors.length > 0) {
    // El estado de la BD cambió desde el análisis en el navegador (o el cliente no es de confianza).
    return NextResponse.json(
      {
        ok: false,
        stage: "analyzed",
        error: "La validación en el servidor encontró errores. No se ha guardado nada.",
        errors: result.errors.slice(0, MAX_ISSUES),
        errorCount: result.errors.length,
        warnings: result.warnings.slice(0, MAX_ISSUES),
        warningCount: result.warnings.length,
        plan: result.plan,
        preview: null,
      },
      { status: 422 },
    );
  }

  // Nombre del archivo solo como metadato (saneado), nunca como ruta ni para decidir el formato.
  const safeName = parsedBody.file_name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const { data, error } = await supabase.rpc("import_workbook", {
    p_payload: result.payload as unknown as Json,
    p_mode: mode,
    p_file_name: safeName,
    p_file_sha256: parsedBody.file_sha256,
  });
  if (error) {
    console.error("[import]", error.code, error.message);
    const message =
      error.code === "P0001" ? error.message : error.code === "23505" ? "Conflicto de códigos duplicados. Vuelve a analizar el archivo." : "La importación no se completó. No se ha guardado ningún dato.";
    return NextResponse.json({ ok: false, stage: "failed", error: message }, { status: 422 });
  }
  return NextResponse.json({ ok: true, stage: "imported", result: data, plan: result.plan });
}
