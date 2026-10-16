import * as React from "react";
import { cn } from "@/lib/utils";

/** Cifra destacada (KPI): etiqueta editorial + valor tabular + contexto opcional. */
function Stat({
  label,
  value,
  hint,
  className,
  icon,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div data-slot="stat" className={cn("flex min-w-0 flex-col gap-1.5", className)} {...props}>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="tabular truncate text-2xl font-semibold tracking-tight">{value}</span>
      {hint && <span className="truncate text-xs text-subtle-foreground">{hint}</span>}
    </div>
  );
}

export { Stat };
