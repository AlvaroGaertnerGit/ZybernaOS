import { describe, expect, it } from "vitest";
import { arrFromMrr, monthlyRecurringCents, periodicityLabel, totalMrr, type RecurringTerms } from "@/lib/calculations/mrr";

const recurring = (periodicity: RecurringTerms["periodicity"], amount: number, extra: Partial<RecurringTerms> = {}): RecurringTerms => ({
  billing_type: "recurring",
  periodicity,
  interval_count: null,
  interval_unit: null,
  amount_cents: amount,
  ...extra,
});

describe("MRR — ejemplos del enunciado", () => {
  it("300 €/mes = 300 € MRR", () => {
    expect(monthlyRecurringCents(recurring("monthly", 30000))).toBe(30000);
  });
  it("900 €/trimestre = 300 € MRR", () => {
    expect(monthlyRecurringCents(recurring("quarterly", 90000))).toBe(30000);
  });
  it("1.200 €/año = 100 € MRR", () => {
    expect(monthlyRecurringCents(recurring("annual", 120000))).toBe(10000);
  });
  it("los pagos únicos no cuentan como MRR", () => {
    expect(
      monthlyRecurringCents({ billing_type: "one_time", periodicity: null, interval_count: null, interval_unit: null, amount_cents: 500000 }),
    ).toBe(0);
  });
});

describe("normalización de periodicidades", () => {
  it("semestral", () => {
    expect(monthlyRecurringCents(recurring("semiannual", 60000))).toBe(10000);
  });
  it("redondea half-up al céntimo", () => {
    expect(monthlyRecurringCents(recurring("annual", 100000))).toBe(8333); // 8333,33
    expect(monthlyRecurringCents(recurring("quarterly", 100))).toBe(33); // 33,33
    expect(monthlyRecurringCents(recurring("quarterly", 200))).toBe(67); // 66,67
    expect(monthlyRecurringCents(recurring("semiannual", 3))).toBe(1); // 0,5 → 1
  });
  it("personalizada: cada 2 meses", () => {
    expect(monthlyRecurringCents(recurring("custom", 50000, { interval_count: 2, interval_unit: "month" }))).toBe(25000);
  });
  it("personalizada: cada 2 años", () => {
    expect(monthlyRecurringCents(recurring("custom", 240000, { interval_count: 2, interval_unit: "year" }))).toBe(10000);
  });
  it("personalizada: cada semana (×52/12)", () => {
    expect(monthlyRecurringCents(recurring("custom", 12000, { interval_count: 1, interval_unit: "week" }))).toBe(52000);
  });
  it("personalizada: cada 4 semanas", () => {
    expect(monthlyRecurringCents(recurring("custom", 40000, { interval_count: 4, interval_unit: "week" }))).toBe(43333);
  });
  it("personalizada: cada 30 días (×365/360)", () => {
    expect(monthlyRecurringCents(recurring("custom", 36000, { interval_count: 30, interval_unit: "day" }))).toBe(36500);
  });
  it("personalizada sin regla completa → 0 (no se inventa una frecuencia)", () => {
    expect(monthlyRecurringCents(recurring("custom", 36000))).toBe(0);
    expect(monthlyRecurringCents(recurring("custom", 36000, { interval_count: 0, interval_unit: "month" }))).toBe(0);
  });
});

describe("totales", () => {
  it("solo suma contrataciones activas", () => {
    const contracts = [
      { ...recurring("monthly", 30000), status: "active" },
      { ...recurring("quarterly", 90000), status: "active" },
      { ...recurring("annual", 120000), status: "paused" },
      { ...recurring("monthly", 50000), status: "cancelled" },
      { billing_type: "one_time" as const, periodicity: null, interval_count: null, interval_unit: null, amount_cents: 999900, status: "active" },
    ];
    expect(totalMrr(contracts)).toBe(60000);
    expect(arrFromMrr(totalMrr(contracts))).toBe(720000);
  });
  it("ARR = MRR × 12", () => {
    expect(arrFromMrr(8333)).toBe(99996);
  });
});

describe("etiquetas", () => {
  it("describe periodicidades personalizadas", () => {
    expect(periodicityLabel("custom", 2, "month")).toBe("Cada 2 meses");
    expect(periodicityLabel("custom", 1, "week")).toBe("Cada semana");
    expect(periodicityLabel(null)).toBe("Pago único");
  });
});
