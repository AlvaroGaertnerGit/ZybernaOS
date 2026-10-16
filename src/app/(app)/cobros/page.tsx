import type { Metadata } from "next";
import { DownloadIcon } from "lucide-react";
import { listPayments, paymentTotals } from "@/server/queries/payments";
import { clientOptions } from "@/server/queries/clients";
import { contractOptions } from "@/server/queries/contracts";
import { pageFrom, param } from "@/server/queries/common";
import { formatMoney } from "@/lib/calculations/money";
import { todayIso } from "@/lib/calculations/dates";
import { PageHeader } from "@/components/layout/page-header";
import { Panel, PanelContent } from "@/components/ui/panel";
import { Stat } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";
import { PaymentsTable } from "@/components/payments/payments-table";
import { NewPaymentButton } from "@/components/payments/new-payment-button";

export const metadata: Metadata = { title: "Cobros" };

export default async function PaymentsPage({ searchParams }: PageProps<"/cobros">) {
  const sp = await searchParams;
  const filters = {
    q: param(sp, "q"),
    status: param(sp, "status"),
    client: param(sp, "client"),
    from: param(sp, "from"),
    to: param(sp, "to"),
  };
  const [result, totals, clients, contracts] = await Promise.all([
    listPayments({ ...filters, page: pageFrom(sp.page) }),
    paymentTotals(filters),
    clientOptions(),
    contractOptions(),
  ]);
  const filtered = Object.values(filters).some(Boolean);
  const exportQs = new URLSearchParams(
    Object.entries({ type: "payments", ...filters }).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cobros"
        description="Cobros previstos, pagos registrados (totales o parciales) e importes pendientes."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/excel/export?${exportQs}`} download>
                <DownloadIcon aria-hidden="true" /> Exportar
              </a>
            </Button>
            <NewPaymentButton
              clients={clients}
              contracts={contracts.map((c) => ({ ...c }))}
              today={todayIso()}
              defaultOpen={param(sp, "registrar") === "1"}
            />
          </>
        }
      />
      <Panel>
        <PanelContent className="grid grid-cols-2 gap-6 p-5 lg:grid-cols-4">
          <Stat label={filtered ? "Previsto (filtro)" : "Previsto total"} value={formatMoney(totals.due)} hint={`${totals.count} cobros`} />
          <Stat label="Cobrado" value={formatMoney(totals.paid)} />
          <Stat label="Pendiente" value={formatMoney(totals.outstanding)} />
          <Stat
            label="Vencido"
            value={<span className={totals.overdue ? "text-tone-danger-foreground" : undefined}>{formatMoney(totals.overdue)}</span>}
            hint="Incluido en pendiente"
          />
        </PanelContent>
      </Panel>
      <Panel className="overflow-hidden">
        <PaymentsTable rows={result.rows} total={result.total} page={result.page} pageSize={result.pageSize} clients={clients} filtered={filtered} />
      </Panel>
    </div>
  );
}
