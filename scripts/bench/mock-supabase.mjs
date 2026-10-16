/**
 * Supabase simulado para medir CPU del Worker sin tocar la base de datos real.
 *
 * - Auth: emite un JWT ES256 y publica su JWKS (getClaims verifica la firma en el Worker,
 *   igual que con Supabase real con claves asimétricas).
 * - PostgREST: devuelve filas sintéticas con el mismo esquema que la app, respetando
 *   limit/offset, count=exact, HEAD y respuestas de objeto único.
 *
 * El tiempo de red no cuenta como CPU en Workers, así que el simulador no altera la
 * medición: lo que se mide es el trabajo de JavaScript del Worker con datos de tamaño real.
 *
 * Uso: node scripts/bench/mock-supabase.mjs --size=realistic|large  (puerto 54321)
 * Escribe scripts/bench/.session.json con la cookie de sesión para el benchmark.
 */
import http from "node:http";
import { generateKeyPairSync, createSign, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const PORT = 54321;
const size = (process.argv.find((a) => a.startsWith("--size=")) ?? "--size=realistic").split("=")[1];
const N = size === "large"
  ? { clients: 500, contracts: 1500, payments: 12000, tx: 9000, activity: 50 }
  : { clients: 60, contracts: 150, payments: 1800, tx: 1500, activity: 50 };

// ---------------------------------------------------------------- Auth (ES256)
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "bench-key", alg: "ES256", use: "sig" };
const b64u = (b) => Buffer.from(b).toString("base64url");
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = Math.floor(Date.now() / 1000);
function signJwt(payload) {
  const head = b64u(JSON.stringify({ alg: "ES256", typ: "JWT", kid: "bench-key" }));
  const body = b64u(JSON.stringify(payload));
  const sig = createSign("SHA256").update(`${head}.${body}`).sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64u(sig)}`;
}
const accessToken = signJwt({
  iss: `http://127.0.0.1:${PORT}/auth/v1`, aud: "authenticated", sub: USER_ID, role: "authenticated",
  email: "bench@zyberna.test", iat: now, exp: now + 7 * 24 * 3600, session_id: randomUUID(), aal: "aal1", is_anonymous: false,
});
const user = { id: USER_ID, aud: "authenticated", role: "authenticated", email: "bench@zyberna.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const session = { access_token: accessToken, token_type: "bearer", expires_in: 604800, expires_at: now + 604800, refresh_token: "bench-refresh", user };
const cookieValue = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
writeFileSync(new URL("./.session.json", import.meta.url), JSON.stringify({ name: "sb-127-auth-token", value: cookieValue }));

// ---------------------------------------------------------------- Datos sintéticos
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const iso = (d) => d.toISOString().slice(0, 10);
const day = (offset) => iso(new Date(Date.now() + offset * 86400000));
const ts = () => new Date(Date.now() - rnd() * 3e10).toISOString();

const categories = [["social", "Redes sociales"], ["seo", "SEO"], ["geo", "GEO"], ["web", "Desarrollo web"], ["maintenance", "Mantenimiento y hosting"], ["other", "Otros"]]
  .map(([slug, name], i) => ({ id: randomUUID(), slug, name, description: null, sort_order: i * 10, is_active: true, created_at: ts(), updated_at: ts() }));
const catalog = Array.from({ length: 15 }, (_, i) => ({
  id: randomUUID(), category_id: categories[i % 6].id, name: `Servicio ${i + 1}`, description: "Descripción del servicio de ejemplo",
  default_price_cents: 30000 + i * 1000, currency: "EUR", suggested_billing_type: i % 3 ? "recurring" : "one_time",
  suggested_periodicity: i % 3 ? "monthly" : null, status: "active", created_at: ts(), updated_at: ts(),
}));
const catalogDeliv = catalog.flatMap((s) => [1, 2, 3, 4].map((p) => ({ id: randomUUID(), service_id: s.id, position: p, title: `Prestación ${p}`, description: null, created_at: ts() })));
const profiles = [
  { id: USER_ID, email: "bench@zyberna.test", full_name: "Socio Bench", role: "admin", is_active: true, created_at: ts(), updated_at: ts() },
  { id: randomUUID(), email: "socio2@zyberna.test", full_name: "Socio Dos", role: "admin", is_active: true, created_at: ts(), updated_at: ts() },
];
const statuses = ["lead", "negotiation", "active", "active", "active", "paused", "finished"];
const clients = Array.from({ length: N.clients }, (_, i) => ({
  id: randomUUID(), code: `CLI-${String(i + 1).padStart(4, "0")}`, trade_name: `Cliente ${i + 1} ${pick(["Studio", "Group", "Clínica", "Restaurante", "Hotel"])}`,
  legal_name: `Cliente ${i + 1} S.L.`, tax_id: `B${String(10000000 + i)}`, contact_name: `Contacto ${i + 1}`, email: `cliente${i + 1}@example.com`,
  phone: "+34 600 000 000", website: "https://example.com", address: "Calle Ejemplo 1", sector: pick(["Retail", "Salud", "Hostelería"]),
  status: pick(statuses), owner_id: pick(profiles).id, joined_on: day(-Math.floor(rnd() * 700)), notes: rnd() > 0.7 ? "Notas del cliente" : null,
  archived_at: null, import_batch_id: null, created_by: USER_ID, updated_by: USER_ID, created_at: ts(), updated_at: ts(),
}));
const periodicities = ["monthly", "monthly", "monthly", "quarterly", "annual"];
const contracts = Array.from({ length: N.contracts }, (_, i) => {
  const c = clients[i % clients.length];
  const cat = pick(categories);
  const recurring = rnd() > 0.25;
  const periodicity = recurring ? pick(periodicities) : null;
  const amount = Math.round(200 + rnd() * 2000) * 100;
  const mrr = !recurring ? 0 : periodicity === "monthly" ? amount : periodicity === "quarterly" ? Math.round(amount / 3) : Math.round(amount / 12);
  return {
    id: randomUUID(), code: `CON-${String(i + 1).padStart(4, "0")}`, client_id: c.id, service_id: pick(catalog).id, category_id: cat.id,
    name: `${cat.name} ${i + 1}`, description: "Descripción", amount_cents: amount, tax_rate: rnd() > 0.5 ? 21 : null, currency: "EUR",
    billing_type: recurring ? "recurring" : "one_time", periodicity, interval_count: null, interval_unit: null,
    start_date: day(-400), end_date: null, next_renewal_date: recurring ? day(Math.floor(rnd() * 60)) : null,
    status: pick(["active", "active", "active", "paused", "finished", "draft"]), owner_id: USER_ID, notes: null, mrr_cents: mrr,
    import_batch_id: null, created_by: USER_ID, updated_by: USER_ID, created_at: ts(), updated_at: ts(),
    client_name: c.trade_name, client_code: c.code, category_name: cat.name, category_slug: cat.slug, catalog_name: "Servicio", owner_name: "Socio Bench",
  };
});
const contractDeliv = contracts.flatMap((k) => [1, 2, 3].map((p) => ({ id: randomUUID(), client_service_id: k.id, position: p, title: `Prestación ${p}`, description: null, created_at: ts() })));
const payments = Array.from({ length: N.payments }, (_, i) => {
  const k = contracts[i % contracts.length];
  const c = clients.find((x) => x.id === k.client_id);
  const due = day(Math.floor(-360 + rnd() * 400));
  const paid = rnd() > 0.35 ? k.amount_cents : rnd() > 0.5 ? Math.round(k.amount_cents / 2) : 0;
  const outstanding = k.amount_cents - paid;
  const status = paid >= k.amount_cents ? "paid" : due < day(0) ? "overdue" : paid > 0 ? "partial" : "pending";
  return {
    id: randomUUID(), code: `COB-${String(i + 1).padStart(5, "0")}`, client_id: c.id, client_service_id: k.id, concept: `${k.name} · periodo ${i}`,
    amount_due_cents: k.amount_cents, tax_rate: k.tax_rate, currency: "EUR", due_date: due, period_start: due, amount_paid_cents: paid,
    last_paid_on: paid ? due : null, voided_at: null, invoice_ref: rnd() > 0.5 ? `F-${i}` : null, notes: null, import_batch_id: null,
    created_by: USER_ID, created_at: ts(), updated_at: ts(), amount_outstanding_cents: outstanding, status,
    client_name: c.trade_name, client_code: c.code, contract_name: k.name, contract_code: k.code,
  };
});
const transactions = Array.from({ length: N.tx }, (_, i) => {
  const p = payments[i % payments.length];
  return { id: randomUUID(), payment_id: p.id, kind: "payment", amount_cents: Math.max(1, p.amount_paid_cents), paid_on: p.due_date, method: "Transferencia", note: null, idempotency_key: `bench-${i}`, created_by: USER_ID, created_at: ts() };
});
const activity = Array.from({ length: N.activity }, (_, i) => ({
  id: i + 1, actor_id: USER_ID, action: pick(["client.created", "contract.created", "payment.recorded"]), entity_type: "clients",
  entity_id: clients[i % clients.length].id, client_id: clients[i % clients.length].id, summary: `Evento ${i}`, metadata: {}, created_at: ts(),
}));
const notes = clients.slice(0, 20).flatMap((c) => [1, 2, 3].map((n) => ({ id: randomUUID(), client_id: c.id, body: `Nota ${n}`, author_id: USER_ID, created_at: ts() })));

const clientsView = clients.map((c) => {
  const ks = contracts.filter((k) => k.client_id === c.id && k.status === "active");
  return { ...c, active_services: ks.length, mrr_cents: ks.reduce((a, k) => a + k.mrr_cents, 0), owner_name: "Socio Bench" };
});
const agency = { id: true, name: "Zyberna", legal_name: null, tax_id: null, email: null, phone: null, website: null, address: null, default_currency: "EUR", default_tax_rate: null, updated_at: ts() };

const tables = {
  profiles, agency_settings: [agency], service_categories: categories, service_catalog: catalog, service_catalog_deliverables: catalogDeliv,
  clients, clients_view: clientsView, client_notes: notes, client_services: contracts, client_services_view: contracts,
  client_service_deliverables: contractDeliv, payments, payments_view: payments, payment_transactions: transactions,
  activity_log: activity, import_batches: [],
};
export const sample = { clientId: clients[0].id, contractId: contracts[0].id };
writeFileSync(new URL("./.ids.json", import.meta.url), JSON.stringify(sample));

// ---------------------------------------------------------------- Filtros mínimos (eq / in)
function applyFilters(rows, params) {
  let out = rows;
  for (const [key, value] of params) {
    if (["select", "order", "limit", "offset", "or", "and"].includes(key)) continue;
    const m = /^(eq|in|is|gte|lte|not)\.(.*)$/.exec(value);
    if (!m) continue;
    const [, op, arg] = m;
    if (op === "eq") out = out.filter((r) => String(r[key]) === arg);
    else if (op === "in") {
      const set = new Set(arg.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, "")));
      out = out.filter((r) => set.has(String(r[key])));
    } else if (op === "is" && arg === "null") out = out.filter((r) => r[key] === null);
    else if (op === "gte") out = out.filter((r) => String(r[key]) >= arg);
    else if (op === "lte") out = out.filter((r) => String(r[key]) <= arg);
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  let body = "";
  for await (const chunk of req) body += chunk;

  if (url.pathname === "/auth/v1/.well-known/jwks.json") return send(200, { keys: [jwk] });
  if (url.pathname === "/auth/v1/user") return send(200, user);
  if (url.pathname === "/auth/v1/token") return send(200, session);
  if (url.pathname.startsWith("/auth/v1/")) return send(200, {});

  const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
  if (rpc) {
    const fn = rpc[1];
    if (fn === "import_workbook") return send(200, { clients: { created: 1 }, batch_id: randomUUID() });
    if (fn === "create_client_with_contracts" || fn === "save_contract") return send(200, { id: randomUUID(), code: "CLI-9999" });
    return send(200, null);
  }

  const t = /^\/rest\/v1\/(\w+)$/.exec(url.pathname);
  if (!t) return send(404, { message: "not found" });
  const rows = tables[t[1]] ?? [];
  if (req.method !== "GET" && req.method !== "HEAD") {
    // Escrituras: devolver la fila "creada" (el bench mide CPU del Worker, no persiste nada)
    const input = body ? JSON.parse(body) : {};
    const row = Array.isArray(input) ? input[0] : input;
    return send(201, req.headers.accept?.includes("vnd.pgrst.object") ? { id: randomUUID(), code: "CLI-9999", ...row } : [{ id: randomUUID(), code: "CLI-9999", ...row }]);
  }
  const filtered = applyFilters(rows, url.searchParams);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? filtered.length);
  const page = filtered.slice(offset, offset + limit);
  const headers = {};
  if ((req.headers.prefer ?? "").includes("count=exact")) headers["Content-Range"] = `${offset}-${offset + page.length - 1}/${filtered.length}`;
  if (req.method === "HEAD") return send(200, undefined, headers);
  if (req.headers.accept?.includes("vnd.pgrst.object")) return send(200, page[0] ?? null, headers);
  return send(200, page, headers);
});
server.listen(PORT, "127.0.0.1", () => console.log(`mock supabase (${size}) listo en :${PORT} · ${JSON.stringify(N)}`));
