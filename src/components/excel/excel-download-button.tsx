"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Descarga un .xlsx generado en el navegador: pide los datos en JSON a `href`
 * (/api/excel/export o /api/excel/template) y ExcelJS crea el archivo localmente.
 */
export function ExcelDownloadButton({
  href,
  children,
  icon = <DownloadIcon aria-hidden="true" />,
  ...props
}: { href: string; children?: ReactNode; icon?: ReactNode } & Omit<ComponentProps<typeof Button>, "onClick" | "asChild">) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const { downloadWorkbook } = await import("@/lib/excel/client");
      await downloadWorkbook(href);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el archivo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button type="button" {...props} onClick={run} disabled={busy || props.disabled} aria-busy={busy}>
      {busy ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : icon}
      {children}
    </Button>
  );
}
