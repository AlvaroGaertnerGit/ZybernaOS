import type { Metadata } from "next";
import { getCatalog } from "@/server/queries/catalog";
import { db, getCategories } from "@/server/queries/common";
import { fetchAll } from "@/lib/fetch-all";
import { PageHeader } from "@/components/layout/page-header";
import { CatalogManager } from "@/components/services/catalog-manager";

export const metadata: Metadata = { title: "Servicios" };

export default async function ServicesPage() {
  const supabase = await db();
  const [categories, services, used] = await Promise.all([
    getCategories(),
    getCatalog(),
    // Paginado: la API devuelve como máximo 1.000 filas por petición.
    fetchAll(
      (f, t) => supabase.from("client_services").select("service_id").not("service_id", "is", null).order("id").range(f, t),
      "el uso del catálogo",
    ),
  ]);
  const usage: Record<string, number> = {};
  for (const r of used) {
    if (r.service_id) usage[r.service_id] = (usage[r.service_id] ?? 0) + 1;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Catálogo de servicios"
        description="Tarifas y prestaciones de referencia de Zyberna. Al contratar se copian y pueden ajustarse para cada cliente; los cambios del catálogo no alteran contratos existentes."
      />
      <CatalogManager categories={categories} services={services} usage={usage} />
    </div>
  );
}
