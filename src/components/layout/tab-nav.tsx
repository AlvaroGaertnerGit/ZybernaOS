import Link from "next/link";
import { cn } from "@/lib/utils";

/** Pestañas como enlaces (estado en la URL, renderizado en servidor, sin JS adicional). */
export function TabNav({
  tabs,
  active,
  label,
}: {
  tabs: { id: string; label: string; href: string; count?: number }[];
  active: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <li key={t.id}>
              <Link
                href={t.href}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex h-10 items-center gap-1.5 px-3 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground",
                  "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors",
                  isActive && "font-medium text-foreground after:bg-foreground",
                )}
              >
                {t.label}
                {t.count !== undefined && <span className="tabular text-xs text-subtle-foreground">{t.count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
