import type { Metadata } from "next";
import { z } from "zod";
import { requireMember } from "@/server/auth";
import { clientOptions } from "@/server/queries/clients";
import { getAgencySettings, getCategories, getMembers, param } from "@/server/queries/common";
import { getCatalog } from "@/server/queries/catalog";
import { PageHeader } from "@/components/layout/page-header";
import { ContractForm } from "@/components/contracts/contract-form";
import { contractDefaultsFromCatalog } from "@/components/contracts/catalog-option";

export const metadata: Metadata = { title: "Nueva contratación" };

export default async function NewContractPage({ searchParams }: PageProps<"/contrataciones/nueva">) {
  const member = await requireMember();
  const sp = await searchParams;
  const clientParam = param(sp, "cliente");
  const clientId = clientParam && z.uuid().safeParse(clientParam).success ? clientParam : "";

  const [clients, categories, catalog, members, settings] = await Promise.all([
    clientOptions(),
    getCategories(),
    getCatalog({ includeInactive: false }),
    getMembers(),
    getAgencySettings(),
  ]);
  const client = clients.find((c) => c.id === clientId);
  const other = categories.find((c) => c.slug === "other")?.id ?? categories[0]?.id ?? "";
  const defaults = contractDefaultsFromCatalog(null, {
    categoryId: other,
    currency: settings?.default_currency ?? "EUR",
    ownerId: member.id,
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Nueva contratación"
        breadcrumbs={
          client
            ? [
                { href: "/clientes", label: "Clientes" },
                { href: `/clientes/${client.id}`, label: client.trade_name },
              ]
            : [{ href: "/contrataciones", label: "Contrataciones" }]
        }
        description="Parte de una plantilla del catálogo o crea un servicio a medida. Precio, condiciones y prestaciones son libres."
      />
      <ContractForm
        clients={clients}
        categories={categories}
        catalog={catalog}
        members={members}
        lockClient={Boolean(client)}
        defaultValues={{ ...defaults, code: "", client_id: client?.id ?? "" }}
      />
    </div>
  );
}
