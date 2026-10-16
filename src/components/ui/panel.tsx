import * as React from "react";
import { cn } from "@/lib/utils";

/** Superficie base de contenido: borde fino, fondo blanco, sin sombra pesada. */
function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="panel"
      className={cn("rounded-xl border border-border bg-surface text-card-foreground shadow-xs", className)}
      {...props}
    />
  );
}

function PanelHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-header"
      className={cn("flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-2.5", className)}
      {...props}
    />
  );
}

function PanelTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 data-slot="panel-title" className={cn("text-sm font-medium tracking-tight", className)} {...props} />;
}

function PanelDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="panel-description" className={cn("text-xs text-muted-foreground", className)} {...props} />;
}

function PanelContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="panel-content" className={cn("p-4", className)} {...props} />;
}

function PanelFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-footer"
      className={cn("flex items-center justify-end gap-2 border-t border-border px-4 py-3", className)}
      {...props}
    />
  );
}

export { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent, PanelFooter };
