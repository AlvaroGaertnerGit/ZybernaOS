"use client";

import { useEffect } from "react";
import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="rounded-xl border border-border bg-surface">
      <EmptyState
        icon={TriangleAlertIcon}
        title="Algo no ha ido bien"
        description={
          <>
            No se pudo cargar esta sección. Comprueba tu conexión e inténtalo de nuevo.
            {error.digest && <span className="mt-1 block font-mono text-xs text-subtle-foreground">Ref. {error.digest}</span>}
          </>
        }
      >
        <Button size="sm" onClick={reset}>
          <RotateCcwIcon aria-hidden="true" /> Reintentar
        </Button>
      </EmptyState>
    </div>
  );
}
