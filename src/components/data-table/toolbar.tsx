"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NativeSelect } from "@/components/ui/native-select";
import { useUrlState } from "./use-url-state";

/** Búsqueda inmediata (con debounce) sincronizada con la URL. */
export function SearchInput({ placeholder = "Buscar…", param = "q" }: { placeholder?: string; param?: string }) {
  const url = useUrlState();
  const initial = url.get(param);
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setRef = useRef(url.set);
  useEffect(() => {
    setRef.current = url.set;
  });

  function onChange(v: string) {
    setValue(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRef.current({ [param]: v.trim() || null }), 250);
  }

  return (
    <div className="relative w-full sm:max-w-xs">
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-lg border border-input bg-surface pr-8 pl-8 text-base shadow-xs transition-colors outline-none placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-8 md:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-subtle-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label="Limpiar búsqueda"
        >
          <XIcon className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function FilterSelect({
  param,
  label,
  options,
  allLabel = "Todos",
  className,
}: {
  param: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel?: string;
  className?: string;
}) {
  const url = useUrlState();
  return (
    <NativeSelect
      aria-label={label}
      value={url.get(param)}
      onChange={(e) => url.set({ [param]: e.target.value || null })}
      className={cn("w-full sm:w-44", className)}
    >
      <option value="">
        {label}: {allLabel}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}

export function TableToolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      {children}
    </div>
  );
}
