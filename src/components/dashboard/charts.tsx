"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/calculations/money";
import { formatMonth } from "@/lib/calculations/dates";

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

const axis = { fontSize: 11, fill: "var(--subtle-foreground)" };

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="tabular flex items-center gap-2 text-muted-foreground">
          {r.color && <span className="size-2 rounded-sm" style={{ background: r.color }} aria-hidden="true" />}
          {r.label}: <span className="text-foreground">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function MonthlyChart({ data }: { data: { month: string; collected: number; expected: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barGap={2} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" tickFormatter={(m: string) => formatMonth(m)} tickLine={false} axisLine={false} tick={axis} />
        <YAxis
          width={56}
          tickFormatter={(v: number) => formatMoney(v, "EUR", { compact: true })}
          tickLine={false}
          axisLine={false}
          tick={axis}
        />
        <Tooltip
          cursor={{ fill: "var(--surface-sunken)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                title={formatMonth(String(label))}
                rows={[
                  { label: "Cobrado", value: formatMoney(Number(payload[0]?.value ?? 0)), color: "var(--chart-1)" },
                  { label: "Previsto", value: formatMoney(Number(payload[1]?.value ?? 0)), color: "var(--chart-6)" },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="collected" name="Cobrado" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        <Bar dataKey="expected" name="Previsto" fill="var(--chart-6)" fillOpacity={0.45} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MrrByCategoryChart({ data }: { data: { category: string; mrr: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="category" width={128} tickLine={false} axisLine={false} tick={{ ...axis, fill: "var(--muted-foreground)" }} />
        <Tooltip
          cursor={{ fill: "var(--surface-sunken)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={String(payload[0].payload.category)}
                rows={[{ label: "MRR", value: formatMoney(Number(payload[0].value)) }]}
              />
            ) : null
          }
        />
        <Bar dataKey="mrr" radius={[0, 3, 3, 0]} maxBarSize={18} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DistributionChart({ data }: { data: { category: string; count: number }[] }) {
  const total = data.reduce((a, d) => a + d.count, 0);
  return (
    <div className="flex h-full items-center gap-4">
      <div className="relative aspect-square h-full max-h-44 min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="category"
              innerRadius="64%"
              outerRadius="100%"
              paddingAngle={1.5}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox title={String(payload[0].name)} rows={[{ label: "Servicios", value: String(payload[0].value) }]} />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-xl font-semibold">{total}</span>
          <span className="text-xs text-subtle-foreground">activos</span>
        </div>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs">
        {data.map((d, i) => (
          <li key={d.category} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} aria-hidden="true" />
            <span className="truncate text-muted-foreground">{d.category}</span>
            <span className="tabular ml-auto">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
