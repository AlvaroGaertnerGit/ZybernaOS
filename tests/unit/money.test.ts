import { describe, expect, it } from "vitest";
import { centsToInputString, computeTax, formatMoney, parseMoneyToCents, sumCents } from "@/lib/calculations/money";

describe("parseMoneyToCents", () => {
  it.each([
    ["300", 30000],
    ["300.5", 30050],
    ["300,50", 30050],
    ["1.200,50", 120050],
    ["1,200.50", 120050],
    ["1.200", 120000],
    ["1,200", 120000],
    ["12.345.678,90", 1234567890],
    ["€ 99,99", 9999],
    ["0", 0],
    ["0,01", 1],
    [" 45 ", 4500],
    [300, 30000],
    [299.99, 29999],
    [0.1 + 0.2, 30],
  ])("%s → %i céntimos", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each([["-5"], ["abc"], [""], ["1,2,3,4"], ["10.9999"], [-1], [Number.NaN], [1.234], [null], [undefined], [{}]])(
    "rechaza %s",
    (input) => {
      expect(parseMoneyToCents(input as unknown)).toBeNull();
    },
  );
});

describe("computeTax", () => {
  it("no aplica impuestos si no están configurados", () => {
    expect(computeTax(10000, null)).toEqual({ base: 10000, tax: null, total: 10000 });
  });
  it("aplica el IVA explícito con redondeo al céntimo", () => {
    expect(computeTax(10000, 21)).toEqual({ base: 10000, tax: 2100, total: 12100 });
    expect(computeTax(999, 21)).toEqual({ base: 999, tax: 210, total: 1209 }); // 209,79 → 210
    expect(computeTax(1000, 10.5)).toEqual({ base: 1000, tax: 105, total: 1105 });
  });
});

describe("formato", () => {
  it("formatea en es-ES", () => {
    expect(formatMoney(120050)).toMatch(/1\.200,50\s€/);
    expect(formatMoney(30000)).toMatch(/300\s€/);
  });
  it("convierte a texto de input sin perder precisión", () => {
    expect(centsToInputString(120050)).toBe("1200.50");
    expect(centsToInputString(5)).toBe("0.05");
    expect(centsToInputString(null)).toBe("");
  });
  it("suma céntimos enteros", () => {
    expect(sumCents([10, 20, null, undefined, 30])).toBe(60);
  });
});
