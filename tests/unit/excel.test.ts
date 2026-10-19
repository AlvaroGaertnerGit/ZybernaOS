import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildWorkbook, templateExamples, type SheetRows } from "@/lib/excel/workbook";
import { checkXlsxBuffer, parseWorkbook } from "@/lib/excel/parse";
import { validateWorkbook, type ImportContext } from "@/lib/excel/validate";
import { sanitizeCellText, unsanitizeCellText, SHEETS } from "@/lib/excel/schema";

const categories = [
  { id: "c-seo", slug: "seo", name: "SEO" },
  { id: "c-geo", slug: "geo", name: "GEO" },
  { id: "c-web", slug: "web", name: "Desarrollo web" },
  { id: "c-social", slug: "social", name: "Redes sociales" },
];
const baseCtx: ImportContext = {
  categories,
  catalog: [{ id: "svc-seo", key: "seo_mensual", category_id: "c-seo", name: "SEO mensual", exclusive_group: null, requires_any: [], excludes: [] }],
  members: [{ id: "m-1", email: "socio1@zyberna.test", full_name: "Socio Uno" }],
  existingClients: [],
  existingContracts: [],
  existingPayments: [],
  today: "2026-10-16",
};

const dataset: SheetRows = {
  clients: [
    { codigo_cliente: "CLI-0001", nombre_comercial: "Grupo Manor", contacto: "Laura", email: "laura@manor.test", estado: "activo", responsable: "socio1@zyberna.test", fecha_alta: "2026-01-10", telefono: "+34 600 111 222", notas: "=HYPERLINK(\"http://x\")" },
    { codigo_cliente: "CLI-0002", nombre_comercial: "Clínica Sol", estado: "potencial", fecha_alta: "2026-02-01" },
  ],
  contracts: [
    { codigo_contratacion: "CON-0001", codigo_cliente: "CLI-0001", categoria: "seo", servicio: "SEO mensual", nombre_plan: "Gestión SEO", precio: 450, moneda: "EUR", tipo_cobro: "recurrente", periodicidad: "mensual", fecha_inicio: "2026-01-10", estado: "activo" },
    { codigo_contratacion: "CON-0002", codigo_cliente: "CLI-0001", categoria: "geo", nombre_plan: "GEO trimestral", precio: 900, impuesto_pct: 21, moneda: "EUR", tipo_cobro: "recurrente", periodicidad: "trimestral", fecha_inicio: "2026-01-10", estado: "activo" },
    { codigo_contratacion: "CON-0003", codigo_cliente: "CLI-0002", categoria: "social", nombre_plan: "Reels", precio: 300, tipo_cobro: "recurrente", periodicidad: "personalizada", intervalo_cada: 2, intervalo_unidad: "meses", fecha_inicio: "2026-02-01" },
  ],
  deliverables: [
    { codigo_contratacion: "CON-0001", orden: 1, prestacion: "Auditoría técnica inicial" },
    { codigo_contratacion: "CON-0001", orden: 2, prestacion: "Informe mensual" },
  ],
  payments: [
    { codigo_cobro: "COB-00001", codigo_cliente: "CLI-0001", codigo_contratacion: "CON-0001", concepto: "SEO enero", importe: 450, fecha_vencimiento: "2026-01-15", estado: "cobrado", fecha_cobro: "2026-01-14", importe_cobrado: 450 },
    { codigo_cobro: "COB-00002", codigo_cliente: "CLI-0001", codigo_contratacion: "CON-0002", concepto: "GEO T1", importe: 900, fecha_vencimiento: "2026-02-15", estado: "parcial", fecha_cobro: "2026-02-20", importe_cobrado: 300.5 },
  ],
};

async function roundTrip(rows: SheetRows, withInstructions = false) {
  const buf = await buildWorkbook({ rows, categories, withInstructions });
  expect(checkXlsxBuffer(buf)).toBeNull();
  return parseWorkbook(buf);
}

describe("plantilla", () => {
  it("genera las 6 hojas en orden, con instrucciones y ejemplos ignorados al importar", async () => {
    const buf = await buildWorkbook({ rows: templateExamples(), categories, withInstructions: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["INSTRUCCIONES", "CLIENTES", "CONTRATACIONES", "PRESTACIONES", "COBROS", "CATALOGOS"]);
    const clientes = wb.getWorksheet("CLIENTES")!;
    expect(clientes.getRow(1).values).toEqual([undefined, ...SHEETS.clients.columns.map((c) => c.key)]);
    expect(clientes.getCell("J2").dataValidation?.type).toBe("list");

    const parsed = await parseWorkbook(buf);
    expect(parsed.errors).toEqual([]);
    const result = validateWorkbook(parsed.sheets, baseCtx, "skip");
    // Solo hay ejemplos → nada que importar
    expect(result.payload.clients).toHaveLength(0);
    expect(result.warnings.some((w) => w.message.includes("ejemplo"))).toBe(true);
  });
});

describe("exportación → reimportación", () => {
  it("conserva relaciones, importes exactos, fechas y textos", async () => {
    const parsed = await roundTrip(dataset);
    expect(parsed.errors).toEqual([]);
    const r = validateWorkbook(parsed.sheets, baseCtx, "skip");
    expect(r.errors).toEqual([]);
    expect(r.plan.clients).toEqual({ create: 2, existing: 0 });
    expect(r.plan.contracts).toEqual({ create: 3, existing: 0 });
    expect(r.plan.payments).toEqual({ create: 2, existing: 0 });

    const manor = r.payload.clients.find((c) => c.code === "CLI-0001")!;
    expect(manor.owner_id).toBe("m-1");
    expect(manor.joined_on).toBe("2026-01-10");
    expect(manor.phone).toBe("+34 600 111 222");
    expect(manor.notes).toBe('=HYPERLINK("http://x")'); // saneado al exportar y restaurado al importar

    const geo = r.payload.contracts.find((c) => c.code === "CON-0002")!;
    expect(geo).toMatchObject({ client_code: "CLI-0001", amount_cents: 90000, tax_rate: 21, periodicity: "quarterly", billing_type: "recurring" });
    const seo = r.payload.contracts.find((c) => c.code === "CON-0001")!;
    expect(seo.service_id).toBe("svc-seo");
    const custom = r.payload.contracts.find((c) => c.code === "CON-0003")!;
    expect(custom).toMatchObject({ periodicity: "custom", interval_count: 2, interval_unit: "month" });

    expect(r.payload.deliverables.map((d) => d.title)).toEqual(["Auditoría técnica inicial", "Informe mensual"]);
    const partial = r.payload.payments.find((p) => p.code === "COB-00002")!;
    expect(partial).toMatchObject({ amount_due_cents: 90000, amount_paid_cents: 30050, paid_on: "2026-02-20", contract_code: "CON-0002" });
  });

  it("reimportar sobre los mismos datos no crea duplicados", async () => {
    const parsed = await roundTrip(dataset);
    const ctx: ImportContext = {
      ...baseCtx,
      existingClients: [
        { code: "CLI-0001", email: "laura@manor.test", trade_name: "Grupo Manor" },
        { code: "CLI-0002", email: null, trade_name: "Clínica Sol" },
      ],
      existingContracts: [
        { code: "CON-0001", client_code: "CLI-0001" },
        { code: "CON-0002", client_code: "CLI-0001" },
        { code: "CON-0003", client_code: "CLI-0002" },
      ],
      existingPayments: [
        { code: "COB-00001", client_code: "CLI-0001" },
        { code: "COB-00002", client_code: "CLI-0001" },
      ],
    };
    const r = validateWorkbook(parsed.sheets, ctx, "skip");
    expect(r.errors).toEqual([]);
    expect(r.plan.clients).toEqual({ create: 0, existing: 2 });
    expect(r.plan.contracts).toEqual({ create: 0, existing: 3 });
    expect(r.plan.payments).toEqual({ create: 0, existing: 2 });
    expect(r.warnings.some((w) => w.message.includes("se omitirán"))).toBe(true);
  });
});

describe("validaciones con hoja, fila, columna y motivo", () => {
  it("detecta errores y relaciones rotas", async () => {
    const bad: SheetRows = {
      clients: [
        { codigo_cliente: "CLI-1", nombre_comercial: "A", email: "no-email", estado: "vip" },
        { codigo_cliente: "CLI-1", nombre_comercial: "B" },
        { codigo_cliente: "CLI-3", nombre_comercial: "" , contacto: "x" },
      ],
      contracts: [
        { codigo_contratacion: "CON-1", codigo_cliente: "CLI-9", categoria: "seo", nombre_plan: "X", precio: "abc", tipo_cobro: "recurrente", fecha_inicio: "2026-01-01" },
        { codigo_contratacion: "CON-2", codigo_cliente: "CLI-1", categoria: "magia", nombre_plan: "Y", precio: 10, tipo_cobro: "recurrente", periodicidad: "personalizada", fecha_inicio: "31/02/2026" },
      ],
      payments: [
        { codigo_cobro: "COB-1", codigo_cliente: "CLI-1", concepto: "Z", importe: 100, fecha_vencimiento: "2026-01-01", importe_cobrado: 150 },
        { codigo_cobro: "COB-2", codigo_cliente: "CLI-1", codigo_contratacion: "CON-1", concepto: "W", importe: 100, fecha_vencimiento: "2026-01-01" },
      ],
    };
    const parsed = await roundTrip(bad);
    const r = validateWorkbook(parsed.sheets, baseCtx, "skip");
    const find = (sheet: string, row: number, column: string) =>
      r.errors.find((e) => e.sheet === sheet && e.row === row && e.column === column);

    expect(find("CLIENTES", 2, "email")?.message).toMatch(/Email no válido/);
    expect(find("CLIENTES", 2, "estado")?.message).toMatch(/Estado no válido/);
    expect(find("CLIENTES", 3, "codigo_cliente")?.message).toMatch(/duplicado/);
    expect(find("CLIENTES", 4, "nombre_comercial")).toBeDefined();
    expect(find("CONTRATACIONES", 2, "codigo_cliente")?.message).toMatch(/CLI-9 no existe/);
    expect(find("CONTRATACIONES", 2, "precio")?.message).toMatch(/Importe no válido/);
    expect(find("CONTRATACIONES", 2, "periodicidad")).toBeDefined();
    expect(find("CONTRATACIONES", 3, "categoria")?.message).toMatch(/desconocida/);
    expect(find("CONTRATACIONES", 3, "intervalo_cada")).toBeDefined();
    expect(find("CONTRATACIONES", 3, "fecha_inicio")?.message).toMatch(/Fecha no válida/);
    expect(find("COBROS", 2, "importe_cobrado")?.message).toMatch(/supera/);
    expect(find("COBROS", 3, "codigo_contratacion")?.message).toMatch(/otro cliente/);
  });

  it("rechaza fórmulas sin evaluarlas", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("CLIENTES");
    ws.addRow(SHEETS.clients.columns.map((c) => c.key));
    ws.addRow(["CLI-1", { formula: "1+1", result: 2 }]);
    const buf = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    const parsed = await parseWorkbook(buf);
    expect(parsed.errors[0]).toMatchObject({ sheet: "CLIENTES", row: 2, column: "nombre_comercial" });
    expect(parsed.errors[0].message).toMatch(/fórmula/);
  });

  it("exige columnas obligatorias y la hoja CLIENTES", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("COBROS").addRow(["codigo_cobro"]);
    const parsed = await parseWorkbook(Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer));
    expect(parsed.errors.some((e) => e.message.includes("Falta la hoja CLIENTES"))).toBe(true);
    expect(parsed.errors.some((e) => e.sheet === "COBROS" && e.column === "codigo_cliente")).toBe(true);
  });
});

describe("seguridad del archivo", () => {
  it("rechaza formatos no admitidos y macros", () => {
    expect(checkXlsxBuffer(Buffer.from("nombre,email\nA,b"))).toMatch(/Formato no admitido/);
    expect(checkXlsxBuffer(Buffer.alloc(0))).toMatch(/vacío/);
    const fake = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("....xl/vbaProject.bin....")]);
    expect(checkXlsxBuffer(fake)).toMatch(/macros/);
    expect(checkXlsxBuffer(Buffer.alloc(5 * 1024 * 1024, 1))).toMatch(/supera/);
  });

  it("neutraliza la inyección de fórmulas al exportar", () => {
    expect(sanitizeCellText("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(sanitizeCellText("@cmd")).toBe("'@cmd");
    expect(sanitizeCellText("-2+3")).toBe("-2+3"); // empieza por dígito tras el signo
    expect(sanitizeCellText("-x")).toBe("'-x");
    expect(sanitizeCellText("+34 600 000 000")).toBe("+34 600 000 000");
    expect(sanitizeCellText("Hola")).toBe("Hola");
    expect(unsanitizeCellText("'=SUM(A1)")).toBe("=SUM(A1)");
    expect(unsanitizeCellText("'normal")).toBe("'normal");
  });
});

describe("Excel procesado en el navegador (filas en JSON)", () => {
  function bigDataset(n: number): SheetRows {
    const pad = (i: number, w: number) => String(i + 1).padStart(w, "0");
    const idx = Array.from({ length: n }, (_, i) => i);
    return {
      clients: idx.map((i) => ({ codigo_cliente: `CLI-${pad(i, 5)}`, nombre_comercial: `Cliente ${i}`, email: `c${i}@test.dev`, estado: "activo", responsable: "socio1@zyberna.test", fecha_alta: "2026-01-10", notas: i === 0 ? "=SUM(A1)" : null })),
      contracts: idx.map((i) => ({ codigo_contratacion: `CON-${pad(i, 5)}`, codigo_cliente: `CLI-${pad(i, 5)}`, categoria: "seo", servicio: "SEO mensual", nombre_plan: "Gestión SEO", precio: 450, moneda: "EUR", tipo_cobro: "recurrente", periodicidad: "mensual", fecha_inicio: "2026-01-10", estado: "activo" })),
      deliverables: idx.map((i) => ({ codigo_contratacion: `CON-${pad(i, 5)}`, orden: 1, prestacion: "Informe mensual" })),
      payments: idx.map((i) => ({ codigo_cobro: `COB-${pad(i, 6)}`, codigo_cliente: `CLI-${pad(i, 5)}`, codigo_contratacion: `CON-${pad(i, 5)}`, concepto: "SEO enero", importe: 450, fecha_vencimiento: "2026-01-15", estado: i % 2 ? "cobrado" : "pendiente", fecha_cobro: i % 2 ? "2026-01-14" : null, importe_cobrado: i % 2 ? 450 : null })),
    };
  }

  it.each([10, 200, 1200])("con %i filas por hoja, validar las filas reenviadas en JSON da el mismo resultado", async (n) => {
    const parsed = await roundTrip(bigDataset(n));
    expect(parsed.errors).toEqual([]);
    // Lo que el navegador envía al servidor:
    const sent = JSON.parse(JSON.stringify(parsed.sheets));
    for (const rows of Object.values(sent) as { values: Record<string, unknown> }[][]) {
      for (const r of rows) for (const v of Object.values(r.values)) expect(v instanceof Date).toBe(false);
    }
    const inBrowser = validateWorkbook(parsed.sheets, baseCtx, "skip");
    const onServer = validateWorkbook(sent, baseCtx, "skip");
    expect(inBrowser.errors).toEqual([]);
    expect(onServer.errors).toEqual([]);
    expect(onServer.payload).toEqual(inBrowser.payload);
    expect(onServer.plan.clients.create).toBe(n);
    expect(onServer.plan.payments.create).toBe(n);
    // La fórmula llega como texto (no se evalúa) y al exportar se neutraliza.
    if (n === 10) expect(onServer.payload.clients[0].notes).toBe("=SUM(A1)");
  }, 60_000);

  it("las fechas se leen como aaaa-mm-dd", async () => {
    const parsed = await roundTrip(bigDataset(1));
    expect(parsed.sheets.clients?.[0].values.fecha_alta).toBe("2026-01-10");
  });

  it("el servidor detecta errores aunque el navegador los ignore (filas manipuladas)", () => {
    const tampered = { clients: [{ row: 2, values: { codigo_cliente: "CLI-1", nombre_comercial: "", estado: "inventado", fecha_alta: "2026-13-45" } }] };
    const r = validateWorkbook(tampered, baseCtx, "skip");
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
