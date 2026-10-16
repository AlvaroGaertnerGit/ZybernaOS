import type { Metadata } from "next";
import { requireMember } from "@/server/auth";
import { getAgencySettings, getCategories, getMembers } from "@/server/queries/common";
import { getCatalog } from "@/server/queries/catalog";
import { todayIso } from "@/lib/calculations/dates";
import { PageHeader } from "@/components/layout/page-header";
import { ClientWizard } from "@/components/clients/client-wizard";

export const metadata: Metadata = { title: "Nuevo cliente" };

export default async function NewClientPage() {
  const member = await requireMember();
  const [members, categories, catalog, settings] = await Promise.all([
    getMembers(),
    getCategories(),
    getCatalog({ includeInactive: false }),
    getAgencySettings(),
  ]);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Nuevo cliente"
        breadcrumbs={[{ href: "/clientes", label: "Clientes" }]}
        description="Alta guiada en cuatro pasos. Puedes guardar el cliente sin contratar todavía ningún servicio."
      />
      <ClientWizard
        members={members}
        categories={categories}
        catalog={catalog}
        defaultCurrency={settings?.default_currency ?? "EUR"}
        currentMemberId={member.id}
        today={todayIso()}
      />
    </div>
  );
}
