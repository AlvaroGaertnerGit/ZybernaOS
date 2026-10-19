import { describe, expect, it } from "vitest";
import { checkAgainstExisting, findViolations, hasUnmetRequirements, selectService, shouldCheckRequires } from "@/lib/catalog/rules";
import { centsToField, formatPercent } from "@/lib/calculations/money";
import { modalityKey } from "@/lib/domain";
import { economicSummary, priceDeviation, variableAmount } from "@/lib/calculations/summary";
import {
  contractDefaultsFromCatalog,
  findModality,
  isCustomized,
  summaryLineFromValues,
  type CatalogOption,
} from "@/components/contracts/catalog-option";
import { catalogServiceSchema, contractSchema, wizardContractSchema } from "@/lib/validations/schemas";
import { validateWorkbook, type ImportContext } from "@/lib/excel/validate";

// Catálogo de prueba con la misma estructura que el real (propuesta SEO/GEO 15/10/2026).
function svc(p: Partial<CatalogOption> & Pick<CatalogOption, "id" | "key" | "name">): CatalogOption {
  return {
    category_id: "c-seo",
    description: null,
    default_price_cents: null,
    currency: "EUR",
    suggested_billing_type: "recurring",
    suggested_periodicity: "monthly",
    status: "active",
    deliverables: [],
    modalities: [],
    exclusive_group: null,
    requires_any: [],
    excludes: [],
    ...p,
  };
}
const esencial = svc({ id: "esencial", key: "seo_esencial", name: "SEO Esencial", default_price_cents: 12900, exclusive_group: "seo_plan", deliverables: [{ title: "Ficha GBP", description: null }] });
const local = svc({ id: "local", key: "seo_local", name: "SEO Local", default_price_cents: 24900, exclusive_group: "seo_plan", deliverables: [{ title: "1 contenido mensual", description: null }, { title: "Informe", description: null }] });
const plus = svc({ id: "plus", key: "seo_local_plus", name: "SEO Local Plus", default_price_cents: 34900, exclusive_group: "seo_plan" });
const seoGeo = svc({ id: "seogeo", key: "seo_geo", name: "SEO + GEO", default_price_cents: 49900, exclusive_group: "seo_plan", excludes: ["geo_mensual"] });
const puesta = svc({ id: "puesta", key: "seo_puesta_en_marcha", name: "Puesta en marcha SEO", default_price_cents: 14900, suggested_billing_type: "one_time", suggested_periodicity: null, requires_any: ["group:seo_plan"] });
const geo = svc({ id: "geo", key: "geo_mensual", name: "GEO mensual", category_id: "c-geo" });
const web = svc({ id: "web", key: "web_corporativa", name: "Web corporativa", category_id: "c-web", suggested_billing_type: "one_time", suggested_periodicity: null });
const redes = svc({ id: "redes", key: "redes_sociales", name: "Gestión de redes sociales", category_id: "c-social" });
const mant = svc({
  id: "mant",
  key: "mantenimiento_web",
  name: "Mantenimiento web",
  category_id: "c-maint",
  default_price_cents: 8000,
  modalities: [
    { billing_type: "recurring", periodicity: "quarterly", price_cents: 22500 },
    { billing_type: "recurring", periodicity: "annual", price_cents: null },
  ],
});
// Modalidades excluyentes de un mismo servicio SEO representadas como servicios alternativos.
const seoMensual = svc({ id: "seo-m", key: "seo_mod_mensual", name: "SEO mensual", exclusive_group: "seo_modalidad", default_price_cents: 30000 });
const seoUnico = svc({ id: "seo-u", key: "seo_mod_unico", name: "SEO pago único", exclusive_group: "seo_modalidad", suggested_billing_type: "one_time", suggested_periodicity: null, default_price_cents: 90000 });
const catalog = [esencial, local, plus, seoGeo, puesta, geo, web, redes, mant, seoMensual, seoUnico];

const defaults = (s: CatalogOption) => contractDefaultsFromCatalog(s, { categoryId: "c-other", currency: "EUR" });
const summaryOf = (ids: string[]) =>
  economicSummary(ids.map((id) => summaryLineFromValues(defaults(catalog.find((c) => c.id === id)!), catalog)));

describe("selección de servicios", () => {
  it("1. seleccionar SEO mensual desmarca SEO de pago único (modalidades excluyentes)", () => {
    const r = selectService(["seo-u"], "seo-m", catalog);
    expect(r.selected).toEqual(["seo-m"]);
    expect(r.removed).toEqual(["seo-u"]);
  });
  it("2. seleccionar SEO de pago único desmarca SEO mensual", () => {
    const r = selectService(["seo-m", "web"], "seo-u", catalog);
    expect(r.selected).toEqual(["web", "seo-u"]);
    expect(r.removed).toEqual(["seo-m"]);
  });
  it("3. cambiar SEO Esencial por SEO Local sustituye el plan", () => {
    expect(selectService(["esencial"], "local", catalog)).toEqual({ selected: ["local"], removed: ["esencial"] });
  });
  it("4 y 5. cambiar SEO Local por Local Plus actualiza el precio y no suma planes", () => {
    const { selected } = selectService(["local"], "plus", catalog);
    const s = summaryOf(selected);
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0].base).toBe(34900);
    expect(s.mrr).toBe(34900);
  });
  it("6 y 7. SEO, desarrollo web y redes sociales coexisten", () => {
    let sel: string[] = [];
    for (const id of ["local", "web", "redes"]) sel = selectService(sel, id, catalog).selected;
    expect(sel.sort()).toEqual(["local", "redes", "web"]);
    expect(findViolations(sel.map((service_id) => ({ service_id })), catalog)).toEqual([]);
  });
  it("8. la puesta en marcha se combina con un plan SEO mensual", () => {
    const sel = selectService(["local"], "puesta", catalog).selected;
    expect(sel.sort()).toEqual(["local", "puesta"]);
    expect(findViolations(sel.map((service_id) => ({ service_id })), catalog)).toEqual([]);
  });
  it("9. dependencias: la puesta en marcha exige un plan; cambiar de plan la mantiene", () => {
    expect(hasUnmetRequirements("puesta", ["puesta"], catalog)).toBe(true);
    expect(hasUnmetRequirements("puesta", ["puesta", "plus"], catalog)).toBe(false);
    const v = findViolations([{ service_id: "puesta" }, { service_id: "web" }], catalog);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("requires");
    expect(v[0].message).toContain("SEO Esencial");
    // Cambiar SEO Local por SEO + GEO no rompe la dependencia.
    expect(hasUnmetRequirements("puesta", selectService(["local", "puesta"], "seogeo", catalog).selected, catalog)).toBe(false);
  });
  it("9b. SEO + GEO es incompatible con GEO mensual (en ambos sentidos)", () => {
    expect(selectService(["seogeo"], "geo", catalog).removed).toEqual(["seogeo"]);
    expect(findViolations([{ service_id: "geo" }, { service_id: "seogeo" }], catalog)[0].kind).toBe("excluded");
    // GEO mensual sí es compatible con los demás planes.
    expect(findViolations([{ service_id: "geo" }, { service_id: "local" }], catalog)).toEqual([]);
  });
  it("9c. no se inventan dependencias: SEO no requiere desarrollo web", () => {
    expect(hasUnmetRequirements("local", ["local"], catalog)).toBe(false);
  });
  it("10. desmarcar un servicio lo quita del resumen", () => {
    expect(summaryOf(["web", "local", "mant"]).groups.find((g) => g.key === "monthly")!.base).toBe(24900 + 8000);
    expect(summaryOf(["web", "local"]).groups.find((g) => g.key === "monthly")!.base).toBe(24900);
  });
  it("el mismo plan en otro proyecto (otra web) es válido; en el mismo, no", () => {
    expect(findViolations([{ service_id: "local" }, { service_id: "esencial", project: "Segunda web" }], catalog)).toEqual([]);
    expect(findViolations([{ service_id: "local", project: "Web" }, { service_id: "esencial", project: " web " }], catalog)).toHaveLength(1);
  });
  it("las contrataciones finalizadas o canceladas no cuentan", () => {
    expect(findViolations([{ service_id: "local", status: "cancelled" }, { service_id: "plus", status: "active" }], catalog)).toEqual([]);
  });
  it("contratación individual: avisa si el cliente ya tiene un plan alternativo", () => {
    const existing = [{ id: "x", code: "CON-0001", name: "SEO Local", service_id: "local", project: null, status: "active" }];
    expect(checkAgainstExisting({ service_id: "plus" }, existing, catalog)[0]).toContain("CON-0001");
    // Editar la propia contratación para cambiar de plan sí es válido.
    expect(checkAgainstExisting({ id: "x", service_id: "plus" }, existing, catalog)).toEqual([]);
    expect(checkAgainstExisting({ service_id: "puesta" }, existing, catalog)).toEqual([]);
    expect(checkAgainstExisting({ service_id: "puesta" }, [], catalog)[0]).toContain("requiere");
  });
});

describe("precios", () => {
  it("11. seleccionar un servicio asigna precio, periodicidad y prestaciones del catálogo", () => {
    const d = defaults(local);
    expect(d.amount).toBe("249,00");
    expect(d.billing_type).toBe("recurring");
    expect(d.periodicity).toBe("monthly");
    expect(d.deliverables.map((x) => x.title)).toEqual(["1 contenido mensual", "Informe"]);
    // Servicio sin tarifa (precio a medida): no se inventa un importe.
    expect(defaults(web).amount).toBe("");
  });
  it("12. modificar el precio para un cliente no altera el catálogo y se detecta como personalizado", () => {
    const d = { ...defaults(local), amount: "199" };
    expect(local.default_price_cents).toBe(24900);
    expect(isCustomized(d, local)).toBe(true);
    expect(isCustomized(defaults(local), local)).toBe(false);
    expect(isCustomized({ ...defaults(local), deliverables: [] }, local)).toBe(true);
  });
  it("14. cambiar de modalidad usa la tarifa específica de esa modalidad (sin descuentos inventados)", () => {
    expect(findModality(mant, "recurring", "monthly")?.price_cents).toBe(8000);
    expect(findModality(mant, "recurring", "quarterly")?.price_cents).toBe(22500);
    expect(findModality(mant, "recurring", "annual")?.price_cents).toBeNull();
    expect(findModality(mant, "one_time", null)).toBeUndefined();
  });
  it("15. los pagos únicos no se contabilizan como recurrentes", () => {
    const s = economicSummary([
      { name: "Desarrollo web", billing_type: "one_time", periodicity: null, interval_count: null, interval_unit: null, amount_cents: 120000 },
      { name: "SEO Local", billing_type: "recurring", periodicity: "monthly", interval_count: null, interval_unit: null, amount_cents: 24900 },
      { name: "Mantenimiento", billing_type: "recurring", periodicity: "monthly", interval_count: null, interval_unit: null, amount_cents: 8000 },
    ]);
    expect(s.groups.map((g) => [g.key, g.base])).toEqual([
      ["one_time", 120000],
      ["monthly", 32900],
    ]);
    expect(s.mrr).toBe(32900);
  });
  it("las cuotas de distinta periodicidad no se suman entre sí; el MRR las normaliza", () => {
    const s = summaryOf(["local"]);
    const q = economicSummary([
      ...s.groups.map(() => summaryLineFromValues(defaults(local), catalog)),
      summaryLineFromValues({ ...defaults(mant), periodicity: "quarterly", amount: "225" }, catalog),
    ]);
    expect(q.groups.map((g) => g.key)).toEqual(["monthly", "quarterly"]);
    expect(q.mrr).toBe(24900 + 7500);
  });
  it("16. descuentos y suplementos frente a la tarifa", () => {
    const s = economicSummary([
      summaryLineFromValues({ ...defaults(local), amount: "199" }, catalog),
      summaryLineFromValues({ ...defaults(mant), amount: "90" }, catalog),
    ]);
    const m = s.groups[0];
    expect(m.listTotal).toBe(24900 + 8000);
    expect(m.discount).toBe(5000);
    expect(m.surcharge).toBe(1000);
    expect(m.base).toBe(19900 + 9000);
    expect(priceDeviation(19900, 24900)).toEqual({ diff: -5000, pct: -20.1 });
    expect(priceDeviation(19900, null)).toBeNull();
  });
  it("16b. el impuesto solo se aplica si se indica", () => {
    const s = economicSummary([summaryLineFromValues({ ...defaults(puesta), tax_rate: "21" }, catalog)]);
    expect(s.groups[0]).toMatchObject({ key: "one_time", base: 14900, tax: 3129, total: 18029, hasTax: true });
    expect(economicSummary([summaryLineFromValues(defaults(puesta), catalog)]).groups[0].hasTax).toBe(false);
  });
  it("17. el variable se calcula con base válida y queda pendiente sin ella", () => {
    expect(variableAmount(null, 8)).toBeNull();
    expect(variableAmount(1234567, 8)).toBe(98765);
    expect(variableAmount(250000, 8)).toBe(20000);
    expect(variableAmount(-50000, 8)).toBe(0);
    expect(variableAmount(1, 50)).toBe(1); // 0,5 céntimos → redondeo como PostgreSQL
  });
  it("17b. cuota fija + variable (caso tipo Grupo Manor): el variable no suma al MRR", () => {
    const s = economicSummary([
      { name: "Acuerdo", billing_type: "recurring", periodicity: "monthly", interval_count: null, interval_unit: null, amount_cents: 20000, variable_rate: 8, variable_basis: "profit" },
    ]);
    expect(s.mrr).toBe(20000);
    expect(s.variable).toEqual([{ name: "Acuerdo", rate: 8, basis: "profit" }]);
  });
  it("las líneas sin precio no computan y se señalan", () => {
    const s = summaryOf(["web", "local"]);
    expect(s.missingPrice).toEqual(["Web corporativa"]);
    expect(s.groups.map((g) => g.key)).toEqual(["monthly"]);
  });
});

describe("validación (formularios y servidor)", () => {
  const base = { ...defaults(local), client_id: "00000000-0000-4000-8000-000000000001", code: "", category_id: "00000000-0000-4000-8000-000000000002", service_id: "" };
  it("el componente variable exige porcentaje y base juntos", () => {
    expect(contractSchema.safeParse({ ...base, variable_rate: "8", variable_basis: "" }).success).toBe(false);
    expect(contractSchema.safeParse({ ...base, variable_rate: "", variable_basis: "profit" }).success).toBe(false);
    expect(contractSchema.safeParse({ ...base, variable_rate: "0", variable_basis: "profit" }).success).toBe(false);
    const ok = contractSchema.parse({ ...base, variable_rate: "8", variable_basis: "profit" });
    expect([ok.variable_rate, ok.variable_basis]).toEqual([8, "profit"]);
    expect(wizardContractSchema.safeParse({ ...base, variable_rate: "8", variable_basis: "" }).success).toBe(false);
  });
  it("campos nuevos opcionales: peticiones sin ellos siguen siendo válidas", () => {
    const legacy: Record<string, unknown> = { ...base };
    for (const k of ["project", "variable_rate", "variable_basis"]) delete legacy[k];
    const r = contractSchema.parse(legacy);
    expect([r.project, r.variable_rate, r.variable_basis]).toEqual([null, null, null]);
  });
  it("el catálogo no admite modalidades repetidas ni referencias de reglas mal formadas", () => {
    const svcValues = {
      category_id: "00000000-0000-4000-8000-000000000002",
      name: "Mantenimiento",
      description: "",
      default_price: "80",
      currency: "EUR",
      suggested_billing_type: "recurring" as const,
      suggested_periodicity: "monthly" as const,
      status: "active" as const,
      deliverables: [],
      exclusive_group: "",
      requires_any: [],
      excludes: [],
      modalities: [{ billing_type: "recurring" as const, periodicity: "annual" as const, price: "800" }],
    };
    expect(catalogServiceSchema.safeParse(svcValues).success).toBe(true);
    expect(
      catalogServiceSchema.safeParse({ ...svcValues, modalities: [{ billing_type: "recurring", periodicity: "monthly", price: "70" }] }).success,
    ).toBe(false);
    expect(catalogServiceSchema.safeParse({ ...svcValues, requires_any: ["SEO Local"] }).success).toBe(false);
    expect(catalogServiceSchema.parse({ ...svcValues, exclusive_group: "Seo_Plan", requires_any: ["group:seo_plan"] })).toMatchObject({
      exclusive_group: "seo_plan",
      requires_any: ["group:seo_plan"],
    });
  });
});

describe("19. Excel aplica las mismas reglas", () => {
  const ctx: ImportContext = {
    categories: [
      { id: "c-seo", slug: "seo", name: "SEO" },
      { id: "c-web", slug: "web", name: "Desarrollo web" },
    ],
    catalog,
    members: [],
    existingClients: [{ code: "CLI-0009", email: null, trade_name: "Existente" }],
    existingContracts: [{ code: "CON-0090", client_code: "CLI-0009", service_id: "local", project: null, status: "active" }],
    existingPayments: [],
    today: "2026-10-19",
  };
  const row = (code: string, client: string, servicio: string, extra: Record<string, unknown> = {}) => ({
    codigo_contratacion: code,
    codigo_cliente: client,
    categoria: "seo",
    servicio,
    nombre_plan: servicio,
    precio: 100,
    tipo_cobro: "recurrente",
    periodicidad: "mensual",
    fecha_inicio: "2026-10-01",
    ...extra,
  });
  const clients = [{ codigo_cliente: "CLI-1", nombre_comercial: "Nuevo" }];
  const run = (contracts: Record<string, unknown>[], mode: "skip" | "update" = "skip") =>
    validateWorkbook(
      {
        clients: clients.map((values, i) => ({ row: i + 2, values: values as never })),
        contracts: contracts.map((values, i) => ({ row: i + 2, values: values as never })),
      },
      ctx,
      mode,
    );

  it("rechaza dos planes SEO para el mismo cliente y proyecto, indicando la fila", () => {
    const r = run([row("CON-1", "CLI-1", "SEO Esencial"), row("CON-2", "CLI-1", "seo_local_plus")]);
    expect(r.errors).toEqual([expect.objectContaining({ sheet: "CONTRATACIONES", row: 3, column: "servicio", message: expect.stringContaining("son alternativas") })]);
  });
  it("acepta plan + puesta en marcha (en cualquier orden) y el mismo plan en otro proyecto", () => {
    const r = run([
      row("CON-1", "CLI-1", "Puesta en marcha SEO", { tipo_cobro: "unico", periodicidad: "" }),
      row("CON-2", "CLI-1", "SEO Local"),
      row("CON-3", "CLI-1", "SEO Esencial", { proyecto: "Segunda web" }),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.payload.contracts[2]).toMatchObject({ project: "Segunda web" });
  });
  it("rechaza la puesta en marcha sin plan", () => {
    const r = run([row("CON-1", "CLI-1", "Puesta en marcha SEO", { tipo_cobro: "unico", periodicidad: "" })]);
    expect(r.errors[0]).toMatchObject({ row: 2, column: "servicio", message: expect.stringContaining("requiere") });
  });
  it("tiene en cuenta las contrataciones vivas que ya existen en la aplicación", () => {
    const r = run([row("CON-1", "CLI-0009", "SEO Esencial")]);
    expect(r.errors[0].message).toContain("CON-0090");
    // En modo actualización, reescribir CON-0090 con otro plan es un cambio de plan válido.
    expect(run([row("CON-0090", "CLI-0009", "SEO Local Plus")], "update").errors).toEqual([]);
  });
  it("componente variable: valida porcentaje y base, y lo incluye en el payload", () => {
    const ok = run([row("CON-1", "CLI-1", "SEO Local", { variable_pct: 8, variable_base: "beneficios" })]);
    expect(ok.errors).toEqual([]);
    expect(ok.payload.contracts[0]).toMatchObject({ variable_rate: 8, variable_basis: "profit" });
    const bad = run([row("CON-1", "CLI-1", "SEO Local", { variable_pct: 8 })]);
    expect(bad.errors[0]).toMatchObject({ column: "variable_base" });
  });
});

describe("helpers compartidos", () => {
  it("la dependencia se exige al contratar, al cambiar de servicio o al reactivar (igual que la BD)", () => {
    expect(shouldCheckRequires(null, "puesta")).toBe(true);
    expect(shouldCheckRequires({ service_id: "puesta", status: "active" }, "puesta")).toBe(false);
    expect(shouldCheckRequires({ service_id: "local", status: "active" }, "puesta")).toBe(true);
    expect(shouldCheckRequires({ service_id: "puesta", status: "cancelled" }, "puesta")).toBe(true);
    expect(shouldCheckRequires({ service_id: "puesta", status: "finished" }, "puesta")).toBe(true);
  });
  it("formatos de campo: céntimos con coma (también negativos) y porcentajes", () => {
    expect([centsToField(24900), centsToField(-8050), centsToField(null), centsToField(5)]).toEqual(["249,00", "-80,50", "", "0,05"]);
    expect([formatPercent(8), formatPercent(8.5)]).toEqual(["8", "8,5"]);
  });
  it("la clave de modalidad es la misma en el formulario y en la validación", () => {
    expect(modalityKey({ billing_type: "one_time", periodicity: null })).toBe("one_time");
    expect(modalityKey({ billing_type: "recurring", periodicity: "annual" })).toBe("recurring:annual");
  });
});
