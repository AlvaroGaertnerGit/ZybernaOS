import { NextResponse } from "next/server";
import { getMember } from "@/server/auth";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_FILE_NAME } from "@/lib/excel/schema";

export const runtime = "nodejs";

/**
 * Datos de la plantilla (categorías para las listas desplegables). El navegador genera el
 * .xlsx con ExcelJS: así el Worker no gasta CPU comprimiendo el libro (límite de Workers Free).
 */
export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const supabase = await createClient();
  const { data: categories, error } = await supabase.from("service_categories").select("slug, name").order("sort_order");
  if (error) return NextResponse.json({ error: "No se pudo preparar la plantilla." }, { status: 500 });
  return NextResponse.json(
    { kind: "template", fileName: TEMPLATE_FILE_NAME, categories: categories ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
