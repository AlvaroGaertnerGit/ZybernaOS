import { describe, expect, it } from "vitest";
import { canRecordPayment, outstanding, paymentStatus } from "@/lib/calculations/payments";
import {
  collectedBetween,
  expectedBetween,
  monthlySeries,
  mrrByCategory,
  pendingSummary,
  serviceDistribution,
} from "@/lib/calculations/dashboard";

const TODAY = "2026-10-16";
const p = (due: number, paid: number, due_date: string, voided_at: string | null = null) => ({
  amount_due_cents: due,
  amount_paid_cents: paid,
  due_date,
  voided_at,
});

describe("estado de cobros", () => {
  it("pendiente / parcial / cobrado / vencido / anulado", () => {
    expect(paymentStatus(p(1000, 0, "2026-10-20"), TODAY)).toBe("pending");
    expect(paymentStatus(p(1000, 400, "2026-10-20"), TODAY)).toBe("partial");
    expect(paymentStatus(p(1000, 1000, "2026-10-01"), TODAY)).toBe("paid");
    expect(paymentStatus(p(1000, 0, "2026-10-15"), TODAY)).toBe("overdue");
    expect(paymentStatus(p(1000, 400, "2026-10-15"), TODAY)).toBe("overdue");
    expect(paymentStatus(p(1000, 0, "2026-10-15", "2026-10-01T00:00:00Z"), TODAY)).toBe("void");
  });
  it("vence el día siguiente a la fecha de vencimiento", () => {
    expect(paymentStatus(p(1000, 0, TODAY), TODAY)).toBe("pending");
  });
  it("importe pendiente", () => {
    expect(outstanding(p(1000, 400, TODAY))).toBe(600);
    expect(outstanding(p(1000, 400, TODAY, "x"))).toBe(0);
  });
  it("valida pagos parciales y evita sobrecobros", () => {
    expect(canRecordPayment(p(1000, 400, TODAY), 600)).toEqual({ ok: true });
    expect(canRecordPayment(p(1000, 400, TODAY), 601).ok).toBe(false);
    expect(canRecordPayment(p(1000, 1000, TODAY), 1).ok).toBe(false);
    expect(canRecordPayment(p(1000, 0, TODAY, "x"), 100).ok).toBe(false);
    expect(canRecordPayment(p(1000, 0, TODAY), 0).ok).toBe(false);
  });
});

describe("dashboard — magnitudes separadas", () => {
  const txs = [
    { amount_cents: 30000, paid_on: "2026-10-02" },
    { amount_cents: 15000, paid_on: "2026-10-16" },
    { amount_cents: 99900, paid_on: "2026-09-30" },
    { amount_cents: 5000, paid_on: "2025-09-30" },
  ];
  const payments = [
    p(30000, 30000, "2026-10-01"),
    p(30000, 15000, "2026-10-05"), // vencido parcial: 150 €
    p(90000, 0, "2026-11-01"), // por vencer
    p(20000, 0, "2026-10-10", "2026-10-11T00:00:00Z"), // anulado: no cuenta
    p(99900, 99900, "2026-09-30"),
  ];

  it("cobrado en el mes = movimientos reales con fecha en el mes", () => {
    expect(collectedBetween(txs, "2026-10-01", "2026-10-31")).toBe(45000);
  });
  it("facturación prevista del mes excluye anulados", () => {
    expect(expectedBetween(payments, "2026-10-01", "2026-10-31")).toBe(60000);
  });
  it("pendiente = vencido + por vencer", () => {
    expect(pendingSummary(payments, TODAY)).toEqual({
      overdue: 15000,
      upcoming: 90000,
      total: 105000,
      overdueCount: 1,
      upcomingCount: 1,
    });
  });
  it("serie de 12 meses", () => {
    const s = monthlySeries(txs, payments, TODAY, 12);
    expect(s).toHaveLength(12);
    expect(s[0].month).toBe("2025-11-01");
    expect(s.at(-1)).toEqual({ month: "2026-10-01", collected: 45000, expected: 60000 });
    expect(s.at(-2)).toEqual({ month: "2026-09-01", collected: 99900, expected: 99900 });
  });

  const contracts = [
    { billing_type: "recurring" as const, periodicity: "monthly" as const, interval_count: null, interval_unit: null, amount_cents: 30000, status: "active", category_name: "SEO" },
    { billing_type: "recurring" as const, periodicity: "monthly" as const, interval_count: null, interval_unit: null, amount_cents: 20000, status: "active", category_name: "GEO" },
    { billing_type: "recurring" as const, periodicity: "annual" as const, interval_count: null, interval_unit: null, amount_cents: 120000, status: "active", category_name: "SEO" },
    { billing_type: "one_time" as const, periodicity: null, interval_count: null, interval_unit: null, amount_cents: 300000, status: "active", category_name: "Desarrollo web" },
    { billing_type: "recurring" as const, periodicity: "monthly" as const, interval_count: null, interval_unit: null, amount_cents: 99999, status: "paused", category_name: "GEO" },
  ];
  it("MRR por categoría (excluye pagos únicos e inactivos)", () => {
    expect(mrrByCategory(contracts)).toEqual([
      { category: "SEO", mrr: 40000 },
      { category: "GEO", mrr: 20000 },
    ]);
  });
  it("distribución de servicios activos", () => {
    expect(serviceDistribution(contracts)).toEqual([
      { category: "SEO", count: 2 },
      { category: "GEO", count: 1 },
      { category: "Desarrollo web", count: 1 },
    ]);
  });
});
