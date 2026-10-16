#!/usr/bin/env node
// Reports real client-JS bundle sizes from a production build. No deps. Node >= 18.
// Usage: node .claude/skills/performance/scripts/bundle-report.mjs [--build] [--json] [--top=N]
//
// Next.js 16 + Turbopack no longer prints a "First Load JS" table in `next
// build` stdout (verified against this project: the table is gone). This
// reads the real build artifacts instead:
//   - .next/build-manifest.json → rootMainFiles/polyfillFiles = the JS
//     baseline shipped on every route (framework + runtime).
//   - .next/static/chunks/*.js  → every chunk in the app, for finding the
//     heaviest ones (code-split candidates).
// Sizes are real gzip (node:zlib), not an estimate.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const shouldBuild = args.includes("--build");
const topN = Number(args.find((a) => a.startsWith("--top="))?.split("=")[1]) || 15;

const NEXT_DIR = ".next";
const CHUNKS_DIR = join(NEXT_DIR, "static", "chunks");

// Rough Lighthouse/Vercel-style budgets. Gzip, not raw.
const SINGLE_CHUNK_BUDGET = 50 * 1024; // 50 KB gzip
const BASELINE_BUDGET = 130 * 1024; // 130 KB gzip

function detectPackageManager() {
  if (existsSync("pnpm-lock.yaml")) return "pnpm build";
  if (existsSync("yarn.lock")) return "yarn build";
  return "npm run build";
}

function runBuild() {
  const cmd = detectPackageManager();
  console.log(`Running \`${cmd}\`...\n`);
  execSync(cmd, { stdio: "inherit" });
}

function sizeOf(path) {
  const buf = readFileSync(path);
  return { raw: buf.length, gzip: gzipSync(buf).length };
}

function fmt(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function walkChunks(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkChunks(full, files);
    else if (entry.endsWith(".js")) files.push(full);
  }
  return files;
}

function main() {
  if (shouldBuild || !existsSync(NEXT_DIR)) {
    if (!shouldBuild) {
      console.log(`No ${NEXT_DIR}/ found — run with --build to build first, or run the build yourself.`);
      process.exitCode = 1;
      return;
    }
    runBuild();
  }

  if (!existsSync(CHUNKS_DIR)) {
    console.error(`${CHUNKS_DIR} not found after build — layout may have changed. Inspect .next/ manually.`);
    process.exitCode = 1;
    return;
  }

  const manifestPath = join(NEXT_DIR, "build-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const baselineFiles = [...(manifest.rootMainFiles || []), ...(manifest.polyfillFiles || [])];
  const baselineSizes = baselineFiles.map((f) => ({
    file: f,
    ...sizeOf(join(NEXT_DIR, f)),
  }));
  const baselineTotal = baselineSizes.reduce(
    (acc, f) => ({ raw: acc.raw + f.raw, gzip: acc.gzip + f.gzip }),
    { raw: 0, gzip: 0 }
  );

  const allChunks = walkChunks(CHUNKS_DIR)
    .map((f) => ({ file: relative(NEXT_DIR, f), ...sizeOf(f) }))
    .sort((a, b) => b.gzip - a.gzip);
  const allChunksTotal = allChunks.reduce((acc, f) => acc + f.gzip, 0);

  const baselineFileSet = new Set(baselineFiles);
  const largeChunks = allChunks.filter(
    (f) => f.gzip > SINGLE_CHUNK_BUDGET && !baselineFileSet.has(f.file.split("\\").join("/"))
  );

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          baseline: { files: baselineSizes, total: baselineTotal, budgetGzip: BASELINE_BUDGET },
          chunks: allChunks.slice(0, topN),
          totalChunksGzip: allChunksTotal,
          largeChunks,
        },
        null,
        2
      )
    );
    return;
  }

  console.log("Baseline JS shipped on every route (rootMainFiles + polyfills):");
  for (const f of baselineSizes) {
    console.log(`  ${fmt(f.gzip).padStart(10)} gzip  (${fmt(f.raw)} raw)  ${f.file}`);
  }
  console.log(
    `  ${"—".repeat(10)}\n  ${fmt(baselineTotal.gzip).padStart(10)} gzip  (${fmt(baselineTotal.raw)} raw)  total baseline`
  );
  if (baselineTotal.gzip > BASELINE_BUDGET) {
    console.log(
      `  ⚠ baseline exceeds the ~${fmt(BASELINE_BUDGET)} gzip budget every route pays — this is framework/runtime cost, not yours to code-split, but worth knowing before adding more to it.`
    );
  }

  console.log(`\nTop ${Math.min(topN, allChunks.length)} chunks by gzip size (of ${allChunks.length} total):`);
  for (const f of allChunks.slice(0, topN)) {
    const isBaseline = baselineFileSet.has(f.file.split("\\").join("/"));
    const flag = isBaseline
      ? "  (framework/runtime baseline — not app code)"
      : f.gzip > SINGLE_CHUNK_BUDGET
        ? "  ⚠ candidate for next/dynamic"
        : "";
    console.log(`  ${fmt(f.gzip).padStart(10)} gzip  (${fmt(f.raw)} raw)  ${f.file}${flag}`);
  }

  console.log(`\nTotal client JS across all chunks: ${fmt(allChunksTotal)} gzip`);
  if (largeChunks.length) {
    console.log(
      `${largeChunks.length} chunk(s) exceed the ${fmt(SINGLE_CHUNK_BUDGET)} gzip single-chunk budget — trace what's in them and consider next/dynamic for anything not needed on first paint.`
    );
  }
}

main();
