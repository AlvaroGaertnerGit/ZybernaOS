import { NextResponse } from "next/server";
import { getMember } from "@/server/auth";
import { createClient } from "@/lib/supabase/server";
import { buildWorkbook, templateExamples } from "@/lib/excel/workbook";
import { TEMPLATE_FILE_NAME } from "@/lib/excel/schema";
import { xlsxResponse } from "../xlsx-response";

export const runtime = "nodejs";

export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const supabase = await createClient();
  const { data: categories } = await supabase.from("service_categories").select("slug, name").order("sort_order");
  const buf = await buildWorkbook({ rows: templateExamples(), categories: categories ?? [], withInstructions: true });
  return xlsxResponse(buf, TEMPLATE_FILE_NAME);
}
