/** Peticiones representativas del benchmark (compartidas por los scripts de medición). */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ExcelJS from "exceljs";

const require = createRequire(import.meta.url);
const { computeCacheBustingSearchParam } = require("next/dist/shared/lib/router/utils/cache-busting-search-param.js");
const { encodeReply } = require("next/dist/compiled/react-server-dom-webpack/client.node.js");

export const BASE = "http://127.0.0.1:8788";
const session = JSON.parse(readFileSync(new URL("./.session.json", import.meta.url), "utf8"));
const ids = JSON.parse(readFileSync(new URL("./.ids.json", import.meta.url), "utf8"));
const cookie = `${session.name}=${session.value}`;

export async function hit(req) {
  const res = await fetch(BASE + req.path, {
    method: req.method ?? "GET",
    headers: { cookie: req.anon ? "" : cookie, ...(req.headers ?? {}) },
    body: await req.body,
    redirect: "manual",
  });
  const buf = await res.arrayBuffer();
  return { status: res.status, bytes: buf.byteLength };
}

async function workbook(rows) {
  const wb = new ExcelJS.Workbook();
  const add = (name, header, make) => {
    const ws = wb.addWorksheet(name);
    ws.addRow(header);
    for (let i = 0; i < rows; i++) ws.addRow(make(i));
  };
  add("CLIENTES", ["codigo_cliente", "nombre_comercial", "razon_social", "cif_nif", "contacto", "email", "telefono", "web", "sector", "estado", "responsable", "fecha_alta", "notas"],
    (i) => [`B-${i}`, `Bench ${i}`, `Bench ${i} SL`, "B00000000", "Ana", `b${i}@example.com`, "+34 600 000 000", "example.com", "Retail", "activo", "bench@zyberna.test", new Date(Date.UTC(2026, 0, 2)), "nota"]);
  add("CONTRATACIONES", ["codigo_contratacion", "codigo_cliente", "categoria", "servicio", "nombre_plan", "descripcion", "precio", "impuesto_pct", "moneda", "tipo_cobro", "periodicidad", "intervalo_cada", "intervalo_unidad", "fecha_inicio", "fecha_fin", "proxima_renovacion", "estado", "responsable", "notas"],
    (i) => [`BC-${i}`, `B-${i}`, "seo", "Servicio 1", "SEO", "desc", 450, 21, "EUR", "recurrente", "mensual", null, null, new Date(Date.UTC(2026, 0, 2)), null, null, "activo", null, null]);
  add("PRESTACIONES", ["codigo_contratacion", "orden", "prestacion", "descripcion"], (i) => [`BC-${i}`, 1, "Informe mensual", null]);
  add("COBROS", ["codigo_cobro", "codigo_cliente", "codigo_contratacion", "concepto", "importe", "impuesto_pct", "moneda", "fecha_vencimiento", "estado", "fecha_cobro", "importe_cobrado", "referencia_factura", "notas"],
    (i) => [`BP-${i}`, `B-${i}`, `BC-${i}`, "Cuota", 450, 21, "EUR", new Date(Date.UTC(2026, 1, 5)), "cobrado", new Date(Date.UTC(2026, 1, 4)), 450, `F-${i}`, null]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function importReq(rows, action = "analyze") {
  const buf = await workbook(rows);
  return {
    name: `POST import ${action} (${rows} filas/hoja, ${(buf.length / 1024).toFixed(0)} KB)`,
    method: "POST",
    path: "/api/excel/import",
    get body() {
      const fd = new FormData();
      fd.set("file", new Blob([buf]), `bench-${rows}.xlsx`);
      fd.set("mode", "skip");
      fd.set("action", action);
      return fd;
    },
  };
}

/** Navegación interna (cliente → servidor): payload RSC desde /dashboard, como hace el router de Next. */
async function rscReq(name, path) {
  const tree = encodeURIComponent(JSON.stringify(["", { children: ["(app)", { children: ["dashboard", { children: ["__PAGE__", {}] }] }] }]));
  const rsc = await computeCacheBustingSearchParam("0", undefined, tree, undefined);
  return { name, path: `${path}?_rsc=${rsc}`, headers: { RSC: "1", "Next-Router-State-Tree": tree } };
}

/** Server Action tal como la envía el cliente de React (cabecera Next-Action + argumentos codificados). */
function actionReq(name, page, exportedName, args) {
  const manifest = JSON.parse(readFileSync(new URL("../../.next/server/server-reference-manifest.json", import.meta.url), "utf8"));
  const id = Object.entries(manifest.node).find(([, e]) => e.exportedName === exportedName)?.[0];
  if (!id) throw new Error(`Server Action ${exportedName} no encontrada en el build`);
  return {
    name,
    method: "POST",
    path: page,
    headers: { "Next-Action": id, Accept: "text/x-component" },
    anon: name.includes("login"),
    // El cuerpo se regenera en cada petición (un FormData no se puede reenviar).
    get body() {
      return encodeReply(args());
    },
  };
}

export async function buildRequests(only = "") {
  const payment = await (await fetch("http://127.0.0.1:54321/rest/v1/payments?status=eq.pending&limit=1")).json();
  const clientValues = {
    code: "", trade_name: "Cliente Bench", legal_name: "", tax_id: "", contact_name: "Ana", email: "ana@example.com", phone: "",
    website: "", address: "", sector: "Retail", status: "active", owner_id: "", joined_on: "2026-10-16", notes: "",
  };
  return [
  { name: "GET /login (anónimo)", path: "/login", anon: true },
  { name: "GET /dashboard sin sesión (307)", path: "/dashboard", anon: true },
  { name: "GET /dashboard (HTML)", path: "/dashboard" },
  await rscReq("GET /dashboard (navegación RSC)", "/dashboard"),
  { name: "GET /clientes", path: "/clientes" },
  await rscReq("GET /clientes (navegación RSC)", "/clientes"),
  await rscReq("GET /cobros (navegación RSC)", "/cobros"),
  { name: "GET /clientes/[id]", path: `/clientes/${ids.clientId}` },
  { name: "GET /clientes/nuevo", path: "/clientes/nuevo" },
  { name: "GET /contrataciones", path: "/contrataciones" },
  { name: "GET /contrataciones/[id]", path: `/contrataciones/${ids.contractId}` },
  { name: "GET /cobros", path: "/cobros" },
  { name: "GET /servicios", path: "/servicios" },
  { name: "GET /datos", path: "/datos" },
  { name: "GET /configuracion", path: "/configuracion" },
  actionReq("POST Server Action login (signIn)", "/login", "signIn", () => {
    const fd = new FormData();
    fd.set("email", "bench@zyberna.test");
    fd.set("password", "bench-password-123");
    return [undefined, fd];
  }),
  actionReq("POST Server Action updateClient", `/clientes/${ids.clientId}/editar`, "updateClientAction", () => [ids.clientId, clientValues]),
  actionReq("POST Server Action recordTransaction", "/cobros", "recordTransactionAction", () => [
    { payment_id: payment[0].id, amount: "100,00", paid_on: "2026-10-16", method: "Transferencia", note: "", idempotency_key: crypto.randomUUID() },
  ]),
  { name: "GET /api/excel/template", path: "/api/excel/template" },
  { name: "GET export clients", path: "/api/excel/export?type=clients" },
  { name: "GET export payments", path: "/api/excel/export?type=payments" },
  { name: "GET export all", path: "/api/excel/export?type=all" },
  await importReq(10),
  await importReq(50),
  await importReq(200),
  await importReq(1000),
  await importReq(50, "commit"),
].filter((r) => !only || r.name.includes(only));
}

