import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-tone-neutral text-tone-neutral-foreground",
        info: "bg-tone-info text-tone-info-foreground",
        success: "bg-tone-success text-tone-success-foreground",
        warning: "bg-tone-warning text-tone-warning-foreground",
        danger: "bg-tone-danger text-tone-danger-foreground",
        muted: "bg-tone-muted text-tone-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

function StatusBadge({
  className,
  tone,
  dot = true,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof statusBadgeVariants> & { dot?: boolean }) {
  return (
    <span data-slot="status-badge" className={cn(statusBadgeVariants({ tone }), className)} {...props}>
      {dot && <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

export { StatusBadge, statusBadgeVariants };
