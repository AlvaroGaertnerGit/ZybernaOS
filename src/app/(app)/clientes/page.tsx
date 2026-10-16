import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon, PlusIcon } from "lucide-react";
import { listClients } from "@/server/queries/clients";
import { getMembers, pageFrom, param } from "@/server/queries/common";
import { PageHeader } from "@/components/layout/page-header";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { ClientsTable } from "@/components/clients/clients-table";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientsPage({ searchParams }: PageProps<"/clientes">) {
  const sp = await searchParams;
  const filters = {
    q: param(sp, "q"),
    status: param(sp, "status"),
    owner: param(sp, "owner"),
    archived: param(sp, "archived") === "1",
    sort: param(sp, "sort"),
    dir: param(sp, "dir"),
  };
  const [result, members] = await Promise.all([listClients({ ...filters, page: pageFrom(sp.page) }), getMembers()]);
  const exportQs = new URLSearchParams(
    Object.entries({ type: "clients", q: filters.q, status: filters.status, owner: filters.owner, archived: filters.archived ? "1" : undefined }).filter(
      (e): e is [string, string] => Boolean(e[1]),
    ),
  ).toString();
  const filtered = Boolean(filters.q || filters.status || filters.owner || filters.archived);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clientes"
        description="Toda la cartera de la agencia: estado, responsable, servicios activos e ingresos recurrentes."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/excel/export?${exportQs}`} download>
                <DownloadIcon aria-hidden="true" /> {filtered ? "Exportar filtrados" : "Exportar"}
              </a>
            </Button>
            <Button asChild size="sm">
              <Link href="/clientes/nuevo">
                <PlusIcon aria-hidden="true" /> Nuevo cliente
              </Link>
            </Button>
          </>
        }
      />
      <Panel className="overflow-hidden">
        <ClientsTable
          rows={result.rows}
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
          members={members}
          filtered={filtered}
        />
      </Panel>
    </div>
  );
}
