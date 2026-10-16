import type { Metadata } from "next";
import { FileSpreadsheetIcon } from "lucide-react";
import { db, unwrap } from "@/server/queries/common";
import { PageHeader } from "@/components/layout/page-header";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { ImportWizard } from "@/components/excel/import-wizard";
import { ExcelDownloadButton } from "@/components/excel/excel-download-button";

export const metadata: Metadata = { title: "Importar / Exportar" };

const EXPORTS = [
  { type: "all", title: "Exportar todo", description: "Clientes, contrataciones, prestaciones y cobros. Compatible con la importación." },
  { type: "clients", title: "Clientes", description: "Listado de clientes activos. Para exportar filtrados, usa el botón del listado." },
  { type: "contracts", title: "Contrataciones", description: "Con sus prestaciones." },
  { type: "payments", title: "Cobros", description: "Previstos, cobrados y pendientes." },
] as const;

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" });

export default async function DataPage() {
  const supabase = await db();
  const batches = unwrap(
    await supabase.from("import_batches").select("id, file_name, mode, summary, created_at").order("created_at", { ascending: false }).limit(5),
    "el historial de importaciones",
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Importar / Exportar"
        description="Migra datos desde Excel y descarga copias completas. La plantilla, la exportación y la importación usan el mismo formato."
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2" id="importar">
          <PanelHeader>
            <div>
              <PanelTitle>Importar Excel</PanelTitle>
              <PanelDescription>Se valida todo antes de guardar. Nada se escribe si hay errores.</PanelDescription>
            </div>
            <ExcelDownloadButton
              href="/api/excel/template"
              variant="outline"
              size="sm"
              icon={<FileSpreadsheetIcon aria-hidden="true" />}
              data-testid="download-template"
            >
              Descargar plantilla Excel
            </ExcelDownloadButton>
          </PanelHeader>
          <PanelContent className="p-4 sm:p-5">
            <ImportWizard />
          </PanelContent>
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader>
              <PanelTitle>Exportar</PanelTitle>
            </PanelHeader>
            <ul className="divide-y divide-border">
              {EXPORTS.map((e) => (
                <li key={e.type} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{e.title}</p>
                    <p className="text-xs text-subtle-foreground">{e.description}</p>
                  </div>
                  <ExcelDownloadButton
                    href={`/api/excel/export?type=${e.type}`}
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Descargar ${e.title}`}
                    data-testid={`export-${e.type}`}
                  />
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <PanelHeader>
              <PanelTitle>Últimas importaciones</PanelTitle>
            </PanelHeader>
            {batches.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted-foreground">Todavía no se ha importado ningún archivo.</p>
            ) : (
              <ul className="divide-y divide-border">
                {batches.map((b) => {
                  const s = b.summary as Record<string, { created?: number; updated?: number }>;
                  const created = ["clients", "contracts", "payments"].reduce((a, k) => a + (s?.[k]?.created ?? 0), 0);
                  const updated = ["clients", "contracts", "payments"].reduce((a, k) => a + (s?.[k]?.updated ?? 0), 0);
                  return (
                    <li key={b.id} className="px-4 py-2.5">
                      <p className="truncate text-sm">{b.file_name ?? "Archivo"}</p>
                      <p className="text-xs text-subtle-foreground">
                        {dateTime.format(new Date(b.created_at))} · {created} creados{updated ? ` · ${updated} actualizados` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
