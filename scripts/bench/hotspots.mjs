/**
 * Reparto de la CPU del isolate por módulo para una ruta (perfilador V8). Solo proporciones:
 * el muestreo en Windows es irregular, los ms absolutos los da cpu-bench.mjs.
 * Uso: node scripts/bench/hotspots.mjs --only="export all" [--n=5]
 */
import WebSocket from "ws";
import { buildRequests, hit } from "./requests.mjs";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=").slice(1).join("=");
const [req] = await buildRequests(arg("only", "export all"));
const n = Number(arg("n", 5));
const ws = new WebSocket("ws://127.0.0.1:9229/ws");
await new Promise((ok, ko) => (ws.once("open", ok), ws.once("error", ko)));
let seq = 0;
const pending = new Map();
ws.on("message", (d) => {
  const m = JSON.parse(String(d));
  pending.get(m.id)?.(m);
});
const send = (method, params = {}) => new Promise((ok) => (pending.set(++seq, ok), ws.send(JSON.stringify({ id: seq, method, params }))));
await send("Profiler.enable");
await send("Profiler.setSamplingInterval", { interval: 100 });
await hit(req);
await send("Profiler.start");
for (let i = 0; i < n; i++) await hit(req);
const { result } = await send("Profiler.stop");
const p = result.profile;
const nodes = new Map(p.nodes.map((x) => [x.id, x]));
const bucket = (cf) => {
  if (cf.functionName.startsWith("(")) return cf.functionName;
  const u = cf.url;
  for (const [re, name] of [[/exceljs|jszip|unzipper|sax|saxes|archiver|fast-csv/i, "ExcelJS / ZIP / XML"], [/react-dom|react-server|server\.edge|next\/dist\/compiled\/react/i, "React SSR / RSC"], [/next\/dist|next-server|\.next\/server\/(app|chunks)\/.*(node_modules|next)/i, "Next.js"], [/supabase|postgrest|gotrue|jose/i, "Supabase"], [/zod/i, "Zod"], [/node-internal|node:/i, "Node compat (workerd)"]]) if (re.test(u)) return name;
  if (/src[\/]lib[\/]excel|lib_excel|excel/i.test(u + cf.functionName)) return "src/lib/excel";
  return u ? "resto del bundle" : "nativo";
};
const by = new Map();
let total = 0;
p.samples.forEach((s, i) => {
  const node = nodes.get(s);
  if (node.callFrame.functionName === "(idle)") return;
  const d = Math.min(p.timeDeltas[i] ?? 0, 2000);
  total += d;
  const k = bucket(node.callFrame);
  by.set(k, (by.get(k) ?? 0) + d);
});
const top = new Map();
p.samples.forEach((s, i) => {
  const cf = nodes.get(s).callFrame;
  if (cf.functionName.startsWith("(")) return;
  const k = `${cf.functionName || "(anónima)"} ${cf.url.split(/[\/]/).slice(-1)[0]}:${cf.lineNumber}`;
  top.set(k, (top.get(k) ?? 0) + Math.min(p.timeDeltas[i] ?? 0, 2000));
});
console.log(req.name);
for (const [k, v] of [...by].sort((a, b) => b[1] - a[1])) console.log(`  ${(100 * v / total).toFixed(1).padStart(5)} %  ${k}`);
console.log("  funciones con más tiempo propio:");
for (const [k, v] of [...top].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${(100 * v / total).toFixed(1).padStart(5)} %  ${k}`);
ws.close();
