import { describe, expect, it } from "vitest";
import { API_PAGE_SIZE, fetchAll } from "@/lib/fetch-all";

/** Simula PostgREST con Max rows = 1.000: nunca devuelve más de 1.000 filas por petición. */
function fakeTable(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to + 1, from + 1000);
    return { data: rows.slice(from, end), error: null };
  };
  return { page, calls };
}

describe("fetchAll (límite de 1.000 filas de la API)", () => {
  it.each([0, 1, 999, 1000, 1001, 2500, 12_345])("devuelve las %i filas completas y en orden", async (n) => {
    const t = fakeTable(n);
    const out = await fetchAll(t.page, "la prueba");
    expect(out).toHaveLength(n);
    expect(out.at(-1)?.id ?? 0).toBe(n);
    expect(new Set(out.map((r) => r.id)).size).toBe(n);
    expect(t.calls.length).toBe(Math.floor(n / API_PAGE_SIZE) + 1);
  });

  it("propaga los errores de la API", async () => {
    await expect(fetchAll(async () => ({ data: null, error: { message: "boom" } }), "los cobros")).rejects.toThrow(/los cobros: boom/);
  });

  it("corta si se supera el máximo de seguridad", async () => {
    const t = fakeTable(5000);
    await expect(fetchAll(t.page, "x", { max: 2000 })).rejects.toThrow(/Demasiados/);
  });
});
