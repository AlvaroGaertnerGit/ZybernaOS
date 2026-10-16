import type { Metadata } from "next";
import { getCatalog } from "@/server/queries/catalog";
import { db, getCategories, unwrap } from "@/server/queries/common";
import { PageHeader } from "@/components/layout/page-header";
import { CatalogManager } from "@/components/services/catalog-manager";

export const metadata: Metadata = { title: "Servicios" };

export default async function ServicesPage() {
  const supabase = await db();
  const [categories, services, used] = await Promise.all([
    getCategories(),
    getCatalog(),
    supabase.from("client_services").select("service_id").not("service_id", "is", null).limit(20_000),
  ]);
  const usage: Record<string, number> = {};
  for (const r of unwrap(used, "el uso del catálogo")) {
    if (r.service_id) usage[r.service_id] = (usage[r.service_id] ?? 0) + 1;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Catálogo de servicios"
        description="Plantillas editables de redes sociales, SEO, GEO, desarrollo web y mantenimiento. No imponen precios ni paquetes: cada contratación conserva sus propias condiciones."
      />
      <CatalogManager categories={categories} services={services} usage={usage} />
    </div>
  );
}
