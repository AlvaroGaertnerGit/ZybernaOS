import { cn } from "@/lib/utils";
import { brand } from "@/config/brand";

/** Monograma provisional: una "Z" construida con dos trazos paralelos y una diagonal. */
export function LogoMark({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      data-slot="logo-mark"
      className={cn("size-7 shrink-0", className)}
      {...props}
    >
      <rect width="32" height="32" rx="8" className="fill-foreground" />
      <path d="M10 10.5h12L10 21.5h12" className="stroke-background" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22" cy="21.5" r="1.9" className="fill-chart-2" />
    </svg>
  );
}

export function Logo({ className, showProduct = true }: { className?: string; showProduct?: boolean }) {
  return (
    <span data-slot="logo" className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="flex min-w-0 flex-col leading-none">
        <span className="text-sm font-semibold tracking-tight text-foreground">{brand.name}</span>
        {showProduct && <span className="mt-1 text-xs text-subtle-foreground">{brand.product}</span>}
      </span>
    </span>
  );
}
