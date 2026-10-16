import { describe, expect, it } from "vitest";
import { addMonths, endOfMonth, isIsoDate, parseFlexibleDate, todayIso } from "@/lib/calculations/dates";
import { nextRenewal, periodStart, planPayments, type ScheduleTerms } from "@/lib/calculations/billing";

describe("fechas", () => {
  it("valida fechas ISO reales", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("26-02-01")).toBe(false);
  });
  it("suma meses ajustando a fin de mes sin arrastrar el recorte", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-03-15", -3)).toBe("2025-12-15");
  });
  it("fin de mes", () => {
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonth("2026-12-01")).toBe("2026-12-31");
  });
  it("interpreta fechas de Excel", () => {
    expect(parseFlexibleDate(new Date(Date.UTC(2026, 9, 16)))).toBe("2026-10-16");
    expect(parseFlexibleDate(46311)).toBe("2026-10-16"); // número de serie
    expect(parseFlexibleDate("16/10/2026")).toBe("2026-10-16");
    expect(parseFlexibleDate("1/2/2026")).toBe("2026-02-01");
    expect(parseFlexibleDate("2026-10-16")).toBe("2026-10-16");
    expect(parseFlexibleDate("31/02/2026")).toBeNull();
    expect(parseFlexibleDate("mañana")).toBeNull();
    expect(parseFlexibleDate("")).toBeNull();
  });
  it("hoy en Europe/Madrid", () => {
    expect(todayIso("Europe/Madrid", new Date("2026-10-15T22:30:00Z"))).toBe("2026-10-16");
  });
});

const monthly: ScheduleTerms = {
  billing_type: "recurring",
  periodicity: "monthly",
  interval_count: null,
  interval_unit: null,
  start_date: "2026-01-31",
  end_date: null,
};

describe("periodos de cobro", () => {
  it("mensual desde fin de mes", () => {
    expect([0, 1, 2, 3].map((n) => periodStart(monthly, n))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("trimestral y personalizado", () => {
    expect(periodStart({ ...monthly, periodicity: "quarterly", start_date: "2026-01-15" }, 2)).toBe("2026-07-15");
    expect(
      periodStart({ ...monthly, periodicity: "custom", interval_count: 2, interval_unit: "week", start_date: "2026-01-01" }, 3),
    ).toBe("2026-02-12");
  });
  it("próxima renovación", () => {
    expect(nextRenewal({ ...monthly, start_date: "2026-01-10" }, "2026-03-10")).toBe("2026-04-10");
    expect(nextRenewal({ ...monthly, start_date: "2026-01-10", end_date: "2026-03-31" }, "2026-03-10")).toBeNull();
    expect(nextRenewal({ ...monthly, billing_type: "one_time", periodicity: null }, "2026-03-10")).toBeNull();
  });
});

describe("planPayments — generación acotada e idempotente", () => {
  const terms = { ...monthly, start_date: "2026-01-01", name: "SEO mensual" };

  it("genera los periodos hasta la fecha indicada", () => {
    const plan = planPayments(terms, { until: "2026-04-15", existingPeriods: new Set() });
    expect(plan.map((p) => p.period_start)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]);
    expect(plan[0].concept).toBe("SEO mensual · enero de 2026");
  });

  it("no repite periodos existentes (reejecutar no duplica)", () => {
    const first = planPayments(terms, { until: "2026-04-15", existingPeriods: new Set() });
    const second = planPayments(terms, { until: "2026-04-15", existingPeriods: new Set(first.map((p) => p.period_start)) });
    expect(second).toEqual([]);
  });

  it("limita el número de cobros generados", () => {
    const plan = planPayments({ ...terms, start_date: "2020-01-01" }, { until: "2026-12-31", existingPeriods: new Set(), limit: 500 });
    expect(plan.length).toBe(24);
  });

  it("respeta la fecha de finalización", () => {
    const plan = planPayments({ ...terms, end_date: "2026-02-15" }, { until: "2026-12-31", existingPeriods: new Set() });
    expect(plan.map((p) => p.period_start)).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("pago único: un solo cobro", () => {
    const plan = planPayments(
      { ...terms, billing_type: "one_time", periodicity: null, name: "Web corporativa" },
      { until: "2027-01-01", existingPeriods: new Set() },
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].concept).toBe("Web corporativa");
  });
});
