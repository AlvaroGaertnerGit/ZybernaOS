import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { listContracts } from "@/server/queries/contracts";
import { getCategories, pageFrom, param } from "@/server/queries/common";
import { PageHeader } from "@/components/layout/page-header";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { ContractsTable } from "@/components/contracts/contracts-table";
import { ExcelDownloadButton } from "@/components/excel/excel-download-button";

export const metadata: Metadata = { title: "Contrataciones" };

export default async function ContractsPage({ searchParams }: PageProps<"/contrataciones">) {
  const sp = await searchParams;
  const filters = {
    q: param(sp, "q"),
    status: param(sp, "status"),
    category: param(sp, "category"),
    billing: param(sp, "billing"),
    sort: param(sp, "sort"),
    dir: param(sp, "dir"),
  };
  const [result, categories] = await Promise.all([listContracts({ ...filters, page: pageFrom(sp.page) }), getCategories()]);
  const filtered = Boolean(filters.q || filters.status || filters.category || filters.billing);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contrataciones"
        description="Servicios contratados por cada cliente, con sus condiciones, precio, periodicidad y prestaciones."
        actions={
          <>
            <ExcelDownloadButton href="/api/excel/export?type=contracts" variant="outline" size="sm">
              Exportar
            </ExcelDownloadButton>
            <Button asChild size="sm">
              <Link href="/contrataciones/nueva">
                <PlusIcon aria-hidden="true" /> Nueva contratación
              </Link>
            </Button>
          </>
        }
      />
      <Panel className="overflow-hidden">
        <ContractsTable
          rows={result.rows}
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
          categories={categories}
          filtered={filtered}
        />
      </Panel>
    </div>
  );
}
