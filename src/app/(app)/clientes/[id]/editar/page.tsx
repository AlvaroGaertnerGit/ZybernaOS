import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getClient } from "@/server/queries/clients";
import { getMembers } from "@/server/queries/common";
import { PageHeader } from "@/components/layout/page-header";
import { ClientEditForm } from "@/components/clients/client-edit-form";

export const metadata: Metadata = { title: "Editar cliente" };

export default async function EditClientPage({ params }: PageProps<"/clientes/[id]/editar">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [client, members] = await Promise.all([getClient(id), getMembers()]);
  if (!client) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={`Editar ${client.trade_name}`}
        breadcrumbs={[
          { href: "/clientes", label: "Clientes" },
          { href: `/clientes/${id}`, label: client.trade_name },
        ]}
      />
      <ClientEditForm
        clientId={id}
        members={members}
        defaultValues={{
          code: client.code,
          trade_name: client.trade_name,
          legal_name: client.legal_name ?? "",
          tax_id: client.tax_id ?? "",
          contact_name: client.contact_name ?? "",
          email: client.email ?? "",
          phone: client.phone ?? "",
          website: client.website ?? "",
          address: client.address ?? "",
          sector: client.sector ?? "",
          status: client.status,
          owner_id: client.owner_id ?? "",
          joined_on: client.joined_on,
          notes: client.notes ?? "",
        }}
      />
    </div>
  );
}
