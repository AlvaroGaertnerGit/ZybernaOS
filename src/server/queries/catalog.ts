import "server-only";

import { fetchAll } from "@/lib/fetch-all";
import type { CatalogOption } from "@/components/contracts/catalog-option";
import { db, unwrap } from "./common";

export async function getCatalog({ includeInactive = true } = {}): Promise<CatalogOption[]> {
  const supabase = await db();
  let query = supabase.from("service_catalog").select("*").order("name");
  if (!includeInactive) query = query.eq("status", "active");
  const [services, deliverables, modalities] = await Promise.all([
    query,
    fetchAll(
      (f, t) => supabase.from("service_catalog_deliverables").select("*").order("service_id").order("position").order("id").range(f, t),
      "las prestaciones",
    ),
    fetchAll(
      (f, t) => supabase.from("service_catalog_modalities").select("*").order("service_id").order("position").order("id").range(f, t),
      "las modalidades",
    ),
  ]);
  const byService = new Map<string, CatalogOption["deliverables"]>();
  for (const d of deliverables) {
    const list = byService.get(d.service_id) ?? [];
    list.push({ title: d.title, description: d.description });
    byService.set(d.service_id, list);
  }
  const modalitiesBy = new Map<string, CatalogOption["modalities"]>();
  for (const m of modalities) {
    const list = modalitiesBy.get(m.service_id) ?? [];
    list.push({ billing_type: m.billing_type, periodicity: m.periodicity, price_cents: m.price_cents });
    modalitiesBy.set(m.service_id, list);
  }
  return unwrap(services, "el catálogo").map((s) => ({
    id: s.id,
    key: s.key,
    category_id: s.category_id,
    name: s.name,
    description: s.description,
    default_price_cents: s.default_price_cents,
    currency: s.currency,
    suggested_billing_type: s.suggested_billing_type,
    suggested_periodicity: s.suggested_periodicity,
    status: s.status,
    exclusive_group: s.exclusive_group,
    requires_any: s.requires_any ?? [],
    excludes: s.excludes ?? [],
    deliverables: byService.get(s.id) ?? [],
    modalities: modalitiesBy.get(s.id) ?? [],
  }));
}
