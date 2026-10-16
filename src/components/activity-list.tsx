import Link from "next/link";
import {
  ArchiveIcon,
  CircleDollarSignIcon,
  FilePenLineIcon,
  FilePlusIcon,
  type LucideIcon,
  UserPenIcon,
  UserPlusIcon,
  CalendarClockIcon,
  BanIcon,
} from "lucide-react";
import type { ActivityRow } from "@/types/database";

const ICONS: Record<string, LucideIcon> = {
  "client.created": UserPlusIcon,
  "client.updated": UserPenIcon,
  "client.archived": ArchiveIcon,
  "client.restored": UserPenIcon,
  "contract.created": FilePlusIcon,
  "contract.updated": FilePenLineIcon,
  "payment.recorded": CircleDollarSignIcon,
  "payment.adjusted": CircleDollarSignIcon,
  "payment.scheduled": CalendarClockIcon,
  "payment.voided": BanIcon,
};

const rtf = new Intl.RelativeTimeFormat("es-ES", { numeric: "auto" });

function relative(iso: string, now = Date.now()) {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "ahora";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export function ActivityList({
  items,
  actors,
  linkClients = false,
}: {
  items: ActivityRow[];
  actors: Record<string, string>;
  linkClients?: boolean;
}) {
  if (items.length === 0) return <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin actividad registrada.</p>;
  return (
    <ol className="flex flex-col">
      {items.map((a) => {
        const Icon = ICONS[a.action] ?? FilePenLineIcon;
        const content = (
          <>
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-muted-foreground">
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{a.summary}</span>
              <span className="block text-xs text-subtle-foreground">
                {(a.actor_id && actors[a.actor_id]) || "Sistema"} · <time dateTime={a.created_at}>{relative(a.created_at)}</time>
              </span>
            </span>
          </>
        );
        return (
          <li key={a.id}>
            {linkClients && a.client_id ? (
              <Link
                href={`/clientes/${a.client_id}`}
                className="flex gap-3 px-4 py-2.5 transition-colors outline-none hover:bg-surface-sunken focus-visible:bg-surface-sunken"
              >
                {content}
              </Link>
            ) : (
              <div className="flex gap-3 px-4 py-2.5">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
