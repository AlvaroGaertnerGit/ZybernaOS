"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FileSpreadsheetIcon,
  Loader2Icon,
  RotateCcwIcon,
  UploadIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui/status-badge";

type Issue = { sheet: string; row?: number; column?: string; message: string };
type Plan = Record<"clients" | "contracts" | "deliverables" | "payments", { create: number; existing: number }>;
interface AnalyzeResponse {
  ok: boolean;
  stage: "analyzed" | "imported" | "failed";
  error?: string;
  errors: Issue[];
  errorCount: number;
  warnings: Issue[];
  warningCount: number;
  plan: Plan | null;
  preview: {
    clients: { row: number; code: string; name: string; existing: boolean }[];
    contracts: { row: number; code: string; client: string; name: string; existing: boolean }[];
    payments: { row: number; code: string; client: string; concept: string; existing: boolean }[];
  } | null;
  result?: Record<string, { created?: number; updated?: number; skipped?: number }>;
}

type Submission = NonNullable<import("@/lib/excel/client").FileAnalysis["submission"]>;
const MAX_ISSUES = 300;

const MAX_BYTES = 4 * 1024 * 1024;
const LABELS: Record<keyof Plan, string> = {
  clients: "Clientes",
  contracts: "Contrataciones",
  deliverables: "Prestaciones",
  payments: "Cobros",
};

/** Asistente: subir → validar → previsualizar → confirmar → importar → resultado. */
export function ImportWizard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"skip" | "update">("skip");
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [busy, setBusy] = useState<"analyze" | "commit" | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [done, setDone] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function reset() {
    setFile(null);
    setAnalysis(null);
    setSubmission(null);
    setDone(null);
    setError(null);
    setConfirmUpdate(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  /**
   * analyze: el navegador lee y valida el .xlsx (ExcelJS se carga bajo demanda).
   * commit: se envían solo las filas leídas; el servidor vuelve a validar e importa en una transacción.
   */
  async function send(action: "analyze" | "commit", f = file, m = mode) {
    if (!f) return;
    setBusy(action);
    setError(null);
    try {
      const excel = await import("@/lib/excel/client");
      if (action === "analyze") {
        const a = await excel.analyzeFile(f, m);
        setSubmission(a.submission);
        setAnalysis({
          ok: a.ok,
          stage: "analyzed",
          errors: a.errors.slice(0, MAX_ISSUES),
          errorCount: a.errors.length,
          warnings: a.warnings.slice(0, MAX_ISSUES),
          warningCount: a.warnings.length,
          plan: a.plan,
          preview: a.preview
            ? { clients: a.preview.clients.slice(0, 50), contracts: a.preview.contracts.slice(0, 50), payments: a.preview.payments.slice(0, 50) }
            : null,
        });
        return;
      }
      if (!submission) return;
      const json = await excel.commitImport(submission, m, m === "update" && confirmUpdate);
      if (json.ok && json.stage === "imported") {
        setDone({ ok: true, stage: "imported", errors: [], errorCount: 0, warnings: [], warningCount: 0, plan: null, preview: null, result: json.result });
        toast.success("Importación completada.");
        router.refresh();
        return;
      }
      setError(json.error ?? "La importación no se completó. No se ha guardado ningún dato.");
      if (json.errors?.length) {
        setAnalysis((prev) =>
          prev ? { ...prev, ok: false, errors: json.errors ?? [], errorCount: json.errorCount ?? json.errors?.length ?? 0 } : prev,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar el archivo.");
    } finally {
      setBusy(null);
    }
  }

  function pick(f: File | undefined) {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      setError("Formato no admitido. Sube un archivo .xlsx.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("El archivo supera el máximo de 4 MB.");
      return;
    }
    setFile(f);
    setAnalysis(null);
    setDone(null);
    void send("analyze", f);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4 animate-fade-up" data-testid="import-result">
        <div className="flex items-center gap-3">
          <CheckCircle2Icon className="size-5 text-tone-success-foreground" aria-hidden="true" />
          <p className="font-medium">Importación completada en una única transacción.</p>
        </div>
        <ResultTable result={done.result ?? {}} />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcwIcon aria-hidden="true" /> Importar otro archivo
          </Button>
        </div>
      </div>
    );
  }

  const canImport = analysis?.ok && analysis.errorCount === 0 && submission !== null && (mode === "skip" || confirmUpdate);
  const existing = analysis?.plan ? analysis.plan.clients.existing + analysis.plan.contracts.existing + analysis.plan.payments.existing : 0;

  return (
    <div className="flex flex-col gap-5">
      {!file ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface-sunken/50 px-6 py-10 text-center transition-colors hover:bg-surface-sunken has-focus-visible:ring-2 has-focus-visible:ring-ring",
            dragging && "border-primary bg-tone-info/50",
          )}
        >
          <UploadIcon className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm">
            <span className="font-medium">Arrastra el archivo aquí</span> o haz clic para seleccionarlo
          </span>
          <span className="text-xs text-subtle-foreground">Libro .xlsx con el formato de la plantilla · máx. 4 MB</span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            data-testid="import-file"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </label>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2.5">
            <FileSpreadsheetIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate text-sm">{file.name}</span>
            <span className="tabular text-xs text-subtle-foreground">{(file.size / 1024).toFixed(0)} KB</span>
          </span>
          <Button variant="ghost" size="sm" onClick={reset} disabled={busy !== null}>
            Cambiar
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-tone-danger px-3 py-2.5 text-sm text-tone-danger-foreground">
          <XCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}

      {busy === "analyze" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Loader2Icon className="size-4 animate-spin" aria-hidden="true" /> Leyendo y validando el archivo en tu navegador…
        </p>
      )}

      {analysis && busy !== "analyze" && (
        <div className="flex flex-col gap-5 animate-fade-up" aria-live="polite" data-testid="import-analysis">
          {analysis.plan && (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
              {(Object.keys(LABELS) as (keyof Plan)[]).map((k) => (
                <div key={k} className="bg-surface p-3">
                  <p className="text-xs text-muted-foreground">{LABELS[k]}</p>
                  <p className="tabular mt-1 text-lg font-semibold">{analysis.plan![k].create}</p>
                  <p className="text-xs text-subtle-foreground">
                    {k === "deliverables" ? "a guardar" : "nuevos"}
                    {analysis.plan![k].existing > 0 && ` · ${analysis.plan![k].existing} existentes`}
                  </p>
                </div>
              ))}
            </div>
          )}

          {analysis.errorCount > 0 && (
            <IssueList
              tone="danger"
              title={`${analysis.errorCount} error(es): corrige el archivo y vuelve a subirlo`}
              issues={analysis.errors}
              total={analysis.errorCount}
            />
          )}
          {analysis.warningCount > 0 && (
            <IssueList tone="warning" title={`${analysis.warningCount} aviso(s)`} issues={analysis.warnings} total={analysis.warningCount} />
          )}

          {analysis.preview && analysis.errorCount === 0 && <Preview preview={analysis.preview} />}

          {analysis.errorCount === 0 && existing > 0 && (
            <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">Registros existentes ({existing})</legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "skip"}
                  onChange={() => {
                    setMode("skip");
                    setConfirmUpdate(false);
                    void send("analyze", file, "skip");
                  }}
                  className="mt-1 accent-(--primary)"
                />
                <span>
                  <span className="font-medium">Omitir</span> — no se modifica nada de lo que ya existe (recomendado).
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "update"}
                  onChange={() => {
                    setMode("update");
                    void send("analyze", file, "update");
                  }}
                  className="mt-1 accent-(--primary)"
                />
                <span>
                  <span className="font-medium">Actualizar</span> — sobrescribe los registros existentes con los datos del archivo.
                </span>
              </label>
              {mode === "update" && (
                <label className="mt-1 flex items-start gap-2 rounded-md bg-tone-warning px-2.5 py-2 text-sm text-tone-warning-foreground">
                  <Checkbox checked={confirmUpdate} onCheckedChange={(v) => setConfirmUpdate(v === true)} className="mt-0.5" />
                  Confirmo que quiero sobrescribir {existing} registro(s) existentes.
                </label>
              )}
            </fieldset>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => send("commit")} disabled={!canImport || busy !== null} data-testid="import-confirm">
              {busy === "commit" && <Loader2Icon className="animate-spin" aria-hidden="true" />}
              Importar
            </Button>
            <Button variant="ghost" onClick={reset} disabled={busy !== null}>
              Cancelar
            </Button>
            {busy === "commit" && <span className="text-xs text-muted-foreground">Importando en una única transacción…</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function IssueList({ tone, title, issues, total }: { tone: "danger" | "warning"; title: string; issues: Issue[]; total: number }) {
  const Icon = tone === "danger" ? XCircleIcon : AlertTriangleIcon;
  return (
    <details open={tone === "danger"} className="rounded-lg border border-border">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden",
          tone === "danger" ? "text-tone-danger-foreground" : "text-tone-warning-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden="true" /> {title}
      </summary>
      <div className="max-h-72 overflow-auto border-t border-border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-surface-sunken text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-1.5 font-medium">Hoja</th>
              <th scope="col" className="px-3 py-1.5 font-medium">Fila</th>
              <th scope="col" className="px-3 py-1.5 font-medium">Columna</th>
              <th scope="col" className="px-3 py-1.5 font-medium">Motivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {issues.map((i, idx) => (
              <tr key={idx}>
                <td className="px-3 py-1.5 whitespace-nowrap">{i.sheet}</td>
                <td className="tabular px-3 py-1.5">{i.row ?? "—"}</td>
                <td className="px-3 py-1.5 font-mono">{i.column ?? "—"}</td>
                <td className="px-3 py-1.5">{i.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {total > issues.length && <p className="px-3 py-2 text-xs text-subtle-foreground">… y {total - issues.length} más.</p>}
      </div>
    </details>
  );
}

function Preview({ preview }: { preview: NonNullable<AnalyzeResponse["preview"]> }) {
  const sections = [
    { title: "Clientes", rows: preview.clients.map((r) => ({ code: r.code, label: r.name, existing: r.existing })) },
    { title: "Contrataciones", rows: preview.contracts.map((r) => ({ code: r.code, label: `${r.name} · ${r.client}`, existing: r.existing })) },
    { title: "Cobros", rows: preview.payments.map((r) => ({ code: r.code, label: `${r.concept} · ${r.client}`, existing: r.existing })) },
  ].filter((s) => s.rows.length > 0);
  if (sections.length === 0) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {sections.map((s) => (
        <div key={s.title} className="rounded-lg border border-border">
          <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">Previsualización · {s.title}</p>
          <ul className="max-h-56 divide-y divide-border overflow-auto">
            {s.rows.map((r) => (
              <li key={r.code} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                <span className="min-w-0 truncate">
                  <span className="font-mono text-subtle-foreground">{r.code}</span> {r.label}
                </span>
                <StatusBadge tone={r.existing ? "warning" : "success"} dot={false}>
                  {r.existing ? "Existe" : "Nuevo"}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ResultTable({ result }: { result: Record<string, { created?: number; updated?: number; skipped?: number }> }) {
  return (
    <table className="w-full max-w-lg text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th scope="col" className="py-1.5 font-medium">Tipo</th>
          <th scope="col" className="py-1.5 text-right font-medium">Creados</th>
          <th scope="col" className="py-1.5 text-right font-medium">Actualizados</th>
          <th scope="col" className="py-1.5 text-right font-medium">Omitidos</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {(Object.keys(LABELS) as (keyof Plan)[]).map((k) => (
          <tr key={k} className="border-b border-border last:border-0">
            <td className="py-1.5">{LABELS[k]}</td>
            <td className="py-1.5 text-right">{result[k]?.created ?? 0}</td>
            <td className="py-1.5 text-right">{result[k]?.updated ?? "—"}</td>
            <td className="py-1.5 text-right">{result[k]?.skipped ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
