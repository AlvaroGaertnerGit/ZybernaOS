import "server-only";

import { db, unwrap } from "./common";

export async function getCatalog({ includeInactive = true } = {}) {
  const supabase = await db();
  let query = supabase.from("service_catalog").select("*").order("name");
  if (!includeInactive) query = query.eq("status", "active");
  const [services, deliverables] = await Promise.all([
    query,
    supabase.from("service_catalog_deliverables").select("*").order("position"),
  ]);
  const byService = new Map<string, { title: string; description: string | null }[]>();
  for (const d of unwrap(deliverables, "las prestaciones")) {
    const list = byService.get(d.service_id) ?? [];
    list.push({ title: d.title, description: d.description });
    byService.set(d.service_id, list);
  }
  return unwrap(services, "el catálogo").map((s) => ({ ...s, deliverables: byService.get(s.id) ?? [] }));
}

export type CatalogEntry = Awaited<ReturnType<typeof getCatalog>>[number];
