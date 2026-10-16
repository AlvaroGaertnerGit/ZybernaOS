"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { useUrlState } from "@/components/data-table/use-url-state";

export function MonthPicker({ options, value }: { options: { value: string; label: string }[]; value: string }) {
  const url = useUrlState();
  return (
    <NativeSelect
      aria-label="Periodo"
      value={value}
      onChange={(e) => url.set({ mes: e.target.value === options[0]?.value ? null : e.target.value })}
      className="w-44"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}
