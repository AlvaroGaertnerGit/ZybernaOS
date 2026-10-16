/**
 * Mide la CPU por petición del runtime de Workers (workerd local) con contadores de ciclos
 * por hilo de Windows (QueryThreadCycleTime, ver thread-cycles.ps1). Precisión de ciclo:
 * no depende del tick de 15,6 ms de TotalProcessorTime ni del muestreo de V8.
 *
 * - "Worker": el hilo más activo del proceso workerd que ejecuta el Worker de Next.js
 *   (`wrangler dev` usa otro proceso workerd para su proxy y los assets, que no se cuenta).
 *   Incluye JS, compilación, GC y el código nativo del runtime: es lo que limita Cloudflare.
 * - "workerd total": todos los hilos de ambos procesos (cota superior, incluye E/S).
 * La espera de red (Supabase simulado) no ejecuta código y no suma ciclos. La latencia no se usa.
 *
 * Requisitos: mock-supabase.mjs en :54321 y `wrangler dev -c scripts/bench/wrangler.bench.jsonc --port 8788`.
 * Uso: node scripts/bench/cpu-bench.mjs [--label=realistic] [--n=30] [--only=texto]
 */
import { execFileSync, spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildRequests, hit } from "./requests.mjs";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=")[1];
const label = arg("label", "realistic");
const N = Number(arg("n", 30));
const script = fileURLToPath(new URL("./thread-cycles.ps1", import.meta.url));
// Frecuencia de referencia de los ciclos (TSC) = frecuencia nominal de la CPU.
const MHZ = Number(
  execFileSync("powershell", ["-NoProfile", "-Command", "(Get-ItemProperty 'HKLM:\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0').'~MHz'"], { encoding: "utf8" }).trim(),
);
const toMs = (cycles) => cycles / (MHZ * 1000);

const reader = spawn("powershell", ["-NoProfile", "-File", script], { stdio: ["pipe", "pipe", "inherit"] });
const lines = createInterface({ input: reader.stdout });
const waiting = [];
lines.on("line", (l) => waiting.shift()?.(l));

/** Ciclos por hilo de todos los procesos workerd, con la marca de tiempo de la lectura. */
async function snapshot() {
  const t0 = performance.now();
  const raw = await new Promise((ok) => {
    waiting.push(ok);
    reader.stdin.write("x\n");
  });
  const at = (t0 + performance.now()) / 2;
  const threads = new Map();
  for (const item of raw.trim().split(",")) {
    const [pid, tid, c] = item.split(":");
    threads.set(`${pid}:${tid}`, BigInt(c));
  }
  return { at, threads };
}

let workerPid = null; // proceso workerd que ejecuta el Worker de Next.js (se calibra al inicio)

/** Ciclos entre dos lecturas: hilo con más ciclos del proceso del Worker ("worker") y total de workerd. */
function diff(a, b) {
  let total = 0n;
  const perPid = new Map();
  for (const [k, v] of b.threads) {
    const d = v - (a.threads.get(k) ?? 0n);
    total += d;
    const pid = k.split(":")[0];
    if (d > (perPid.get(pid) ?? 0n)) perPid.set(pid, d);
  }
  const main = workerPid ? (perPid.get(workerPid) ?? 0n) : 0n;
  return { main: toMs(Number(main)), total: toMs(Number(total)), seconds: (b.at - a.at) / 1000, perPid };
}

let idleRate = { main: 0, total: 0 };
async function batch(req, n) {
  const a = await snapshot();
  let last;
  for (let i = 0; i < n; i++) last = await hit(req);
  const b = await snapshot();
  const d = diff(a, b);
  // Se descuenta la actividad de fondo de workerd durante el lote (timers, captura de trazas).
  return { last, main: (d.main - idleRate.main * d.seconds) / n, total: (d.total - idleRate.total * d.seconds) / n };
}

// Calibración: el proceso cuyo hilo más activo crece al generar la plantilla Excel ejecuta el Worker.
{
  const req = { path: "/api/excel/template" };
  await hit(req);
  const a = await snapshot();
  for (let i = 0; i < 5; i++) await hit(req);
  const { perPid } = diff(a, await snapshot());
  workerPid = [...perPid].sort((x, y) => (y[1] > x[1] ? 1 : -1))[0][0];
  console.log(`Proceso workerd del Worker: ${workerPid} (procesos: ${[...perPid.keys()].join(", ")})`);
}

// Actividad en reposo (ms de CPU por segundo), medida durante 5 s.
const i0 = await snapshot();
await new Promise((r) => setTimeout(r, 5000));
const idle = diff(i0, await snapshot());
idleRate = { main: idle.main / idle.seconds, total: idle.total / idle.seconds };
console.log(`CPU ${MHZ} MHz · en reposo: hilo del Worker ${idleRate.main.toFixed(2)} ms/s, workerd total ${idleRate.total.toFixed(2)} ms/s`);

// Control: un asset estático lo sirve el proxy/assets de wrangler sin entrar en el Worker (debe dar ≈ 0).
const chunk = readdirSync(new URL("../../.open-next/assets/_next/static/chunks/", import.meta.url)).find((f) => f.endsWith(".js"));
const asset = await batch({ name: "asset", path: `/_next/static/chunks/${chunk}`, anon: true }, N);
console.log(`Control (asset estático, ${asset.last.status}): hilo del Worker ${asset.main.toFixed(2)} ms/pet, workerd total ${asset.total.toFixed(2)} ms/pet
`);

const results = [];
for (const req of await buildRequests(arg("only", ""))) {
  const heavy = /import|export|template/.test(req.name);
  const n = heavy ? Math.max(5, Math.round(N / 3)) : N;
  try {
    await hit(req); // calentar la ruta (carga perezosa de módulos), se mide aparte la 1ª
    const first = await batch(req, 1);
    const warm = await batch(req, n);
    const r = {
      name: req.name,
      status: warm.last.status,
      kb: +(warm.last.bytes / 1024).toFixed(1),
      n,
      workerMs: +warm.main.toFixed(2),
      processMs: +warm.total.toFixed(2),
      secondMs: +first.main.toFixed(2),
    };
    results.push(r);
    console.log(
      `${r.name.padEnd(46)} ${r.status}  Worker ${String(r.workerMs).padStart(7)} ms  (2ª petición ${r.secondMs}, workerd total ${r.processMs}; n=${n}, ${r.kb} KB)`,
    );
  } catch (e) {
    console.log(`${req.name}: ERROR ${e.message}`);
  }
}
writeFileSync(
  new URL(`./results-${label}.json`, import.meta.url),
  JSON.stringify({ label, mhz: MHZ, n: N, control: { main: asset.main, total: asset.total }, idleRate, results }, null, 2),
);
reader.stdin.end();
