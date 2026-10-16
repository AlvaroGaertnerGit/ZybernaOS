"use client";

import { flexRender, tableFeatures, useTable, type ColumnDef, type RowData } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsUpDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUrlState } from "./use-url-state";

/** Solo el núcleo: ordenación, filtros y paginación se resuelven en servidor. */
export const tableCore = tableFeatures({});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppColumn<T extends RowData> = ColumnDef<typeof tableCore, T, any>;

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TFeatures, TData, TValue> {
    align?: "left" | "right";
    /** Clave de ordenación en servidor; si falta, la columna no es ordenable. */
    sortKey?: string;
    className?: string;
  }
}

export interface DataTableProps<T extends RowData> {
  columns: AppColumn<T>[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  /** Tarjeta alternativa en móvil (las tablas anchas no se reducen: se adaptan). */
  mobileCard?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  getRowId?: (row: T) => string;
  empty?: React.ReactNode;
  defaultSort?: string;
  caption: string;
}

/**
 * Tabla con paginación, ordenación y filtros resueltos en servidor (vía URL).
 * Solo se descarga la página visible.
 */
export function DataTable<T extends RowData>({
  columns,
  data,
  total,
  page,
  pageSize,
  mobileCard,
  onRowClick,
  getRowId,
  empty,
  defaultSort,
  caption,
}: DataTableProps<T>) {
  const url = useUrlState();
  const sortKey = url.get("sort") || defaultSort || "";
  const dir = url.get("dir");
  const table = useTable({ features: tableCore, data, columns, getRowId });

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  function toggleSort(key: string) {
    if (sortKey !== key) url.set({ sort: key, dir: "asc" });
    else url.set({ sort: key, dir: dir === "desc" ? "asc" : "desc" });
  }

  const rows = table.getRowModel().rows;

  return (
    <div data-slot="data-table" className={cn("transition-opacity", url.pending && "opacity-60")} aria-busy={url.pending}>
      {rows.length === 0 ? (
        empty
      ) : (
        <>
          {mobileCard && (
            <ul className="divide-y divide-border md:hidden" aria-label={caption}>
              {rows.map((row) => (
                <li key={row.id}>{mobileCard(row.original)}</li>
              ))}
            </ul>
          )}
          <div className={cn("overflow-x-auto", mobileCard && "hidden md:block")}>
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{caption}</caption>
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-border">
                    {hg.headers.map((header) => {
                      const meta = header.column.columnDef.meta;
                      const sortable = Boolean(meta?.sortKey);
                      const sorted = sortable && sortKey === meta?.sortKey ? (dir === "desc" ? "desc" : "asc") : false;
                      const align = meta?.align;
                      return (
                        <th
                          key={header.id}
                          scope="col"
                          aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                          className={cn(
                            "h-10 px-3 text-left text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-4 last:pr-4",
                            align === "right" && "text-right",
                            meta?.className,
                          )}
                        >
                          {header.isPlaceholder ? null : sortable ? (
                            <button
                              type="button"
                              onClick={() => toggleSort(meta!.sortKey!)}
                              className={cn(
                                "-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                                sorted && "text-foreground",
                              )}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {sorted === "asc" ? (
                                <ArrowUpIcon className="size-3" aria-hidden="true" />
                              ) : sorted === "desc" ? (
                                <ArrowDownIcon className="size-3" aria-hidden="true" />
                              ) : (
                                <ChevronsUpDownIcon className="size-3 opacity-40" aria-hidden="true" />
                              )}
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? (e) => {
                      if ((e.target as HTMLElement).closest("a, button, [role=menuitem]")) return;
                      onRowClick(row.original);
                    } : undefined}
                    className={cn(
                      "group/row border-b border-border transition-colors last:border-0 hover:bg-surface-sunken/70",
                      onRowClick && "cursor-pointer",
                    )}
                  >
                    {row.getAllCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "h-12 px-3 align-middle first:pl-4 last:pr-4",
                            meta?.align === "right" && "text-right tabular",
                            meta?.className,
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {total > 0 && (
        <nav
          aria-label="Paginación"
          className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted-foreground"
        >
          <span className="tabular">
            {from}–{to} de {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={page <= 1}
              onClick={() => url.set({ page: String(page - 1) }, { resetPage: false })}
              aria-label="Página anterior"
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <span className="tabular px-1">
              {page} / {pages}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={page >= pages}
              onClick={() => url.set({ page: String(page + 1) }, { resetPage: false })}
              aria-label="Página siguiente"
            >
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
