import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getContract, liveContracts } from "@/server/queries/contracts";
import { clientOptions } from "@/server/queries/clients";
import { getCategories, getMembers } from "@/server/queries/common";
import { getCatalog } from "@/server/queries/catalog";
import { centsToField, formatPercent } from "@/lib/calculations/money";
import { PageHeader } from "@/components/layout/page-header";
import { ContractForm } from "@/components/contracts/contract-form";

export const metadata: Metadata = { title: "Editar contratación" };


export default async function EditContractPage({ params }: PageProps<"/contrataciones/[id]/editar">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [[{ contract, deliverables }, live], clients, categories, catalog, members] = await Promise.all([
    // Las contrataciones vivas del cliente se piden en cuanto se conoce el cliente, en paralelo al resto.
    getContract(id).then(async (r) => [r, r.contract ? await liveContracts(r.contract.client_id) : []] as const),
    clientOptions(),
    getCategories(),
    getCatalog(),
    getMembers(),
  ]);
  if (!contract) notFound();
  // El cliente puede estar archivado: se incluye para que el selector lo muestre.
  const allClients = clients.some((c) => c.id === contract.client_id)
    ? clients
    : [{ id: contract.client_id, code: contract.client_code, trade_name: contract.client_name }, ...clients];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={`Editar ${contract.name}`}
        breadcrumbs={[
          { href: "/contrataciones", label: "Contrataciones" },
          { href: `/contrataciones/${id}`, label: contract.code },
        ]}
      />
      <ContractForm
        contractId={id}
        clients={allClients}
        categories={categories}
        catalog={catalog}
        members={members}
        liveContracts={live}
        initialServiceId={contract.service_id}
        initialStatus={contract.status}
        lockClient
        defaultValues={{
          code: contract.code,
          client_id: contract.client_id,
          service_id: contract.service_id ?? "",
          category_id: contract.category_id,
          name: contract.name,
          description: contract.description ?? "",
          amount: centsToField(contract.amount_cents),
          tax_rate: contract.tax_rate === null ? "" : String(contract.tax_rate),
          currency: contract.currency,
          billing_type: contract.billing_type,
          periodicity: contract.periodicity ?? "",
          interval_count: contract.interval_count ? String(contract.interval_count) : "",
          interval_unit: contract.interval_unit ?? "",
          start_date: contract.start_date,
          end_date: contract.end_date ?? "",
          next_renewal_date: contract.next_renewal_date ?? "",
          status: contract.status,
          owner_id: contract.owner_id ?? "",
          notes: contract.notes ?? "",
          project: contract.project ?? "",
          variable_rate: contract.variable_rate === null ? "" : formatPercent(contract.variable_rate),
          variable_basis: contract.variable_basis ?? "",
          deliverables: deliverables.map((d) => ({ title: d.title, description: d.description ?? "" })),
        }}
      />
    </div>
  );
}
