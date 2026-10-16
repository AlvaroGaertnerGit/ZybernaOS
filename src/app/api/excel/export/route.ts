import { NextResponse, type NextRequest } from "next/server";
import { getMember } from "@/server/auth";
import { createClient } from "@/lib/supabase/server";
import { exportRows } from "@/server/queries/excel";
import { buildWorkbook } from "@/lib/excel/workbook";
import type { SheetKey } from "@/lib/excel/schema";
import { isIsoDate, todayIso } from "@/lib/calculations/dates";
import { xlsxResponse } from "../xlsx-response";

export const runtime = "nodejs";

const TYPES = {
  clients: { sheets: ["clients"], file: "Clientes" },
  contracts: { sheets: ["contracts", "deliverables"], file: "Contrataciones" },
  payments: { sheets: ["payments"], file: "Cobros" },
  all: { sheets: ["clients", "contracts", "deliverables", "payments"], file: "Completo" },
} as const satisfies Record<string, { sheets: SheetKey[]; file: string }>;

export async function GET(request: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const type = (sp.get("type") ?? "all") as keyof typeof TYPES;
  if (!(type in TYPES)) return NextResponse.json({ error: "Tipo de exportación no válido" }, { status: 400 });
  const date = (k: string) => {
    const v = sp.get(k);
    return v && isIsoDate(v) ? v : undefined;
  };
  const uuidOrNull = (k: string) => {
    const v = sp.get(k);
    return v && (/^[0-9a-f-]{36}$/i.test(v) || v === "none") ? v : undefined;
  };

  const supabase = await createClient();
  try {
    const rows = await exportRows(supabase, type, {
      q: sp.get("q") ?? undefined,
      status: sp.get("status") ?? undefined,
      owner: uuidOrNull("owner"),
      archived: sp.get("archived") === "1",
      client: uuidOrNull("client"),
      from: date("from"),
      to: date("to"),
    });
    const { data: categories } = await supabase.from("service_categories").select("slug, name").order("sort_order");
    const buf = await buildWorkbook({
      rows,
      categories: categories ?? [],
      withInstructions: false,
      sheets: [...TYPES[type].sheets],
    });
    return xlsxResponse(buf, `ZYBERNA_${TYPES[type].file}_${todayIso()}.xlsx`);
  } catch (e) {
    console.error("[export]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo generar la exportación." }, { status: 500 });
  }
}
