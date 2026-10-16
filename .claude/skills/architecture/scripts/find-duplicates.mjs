#!/usr/bin/env node
// Find duplicated code blocks via line-shingling. No deps. Node >= 18.
// Usage: node .claude/skills/architecture/scripts/find-duplicates.mjs [path] [--lines=6] [--json]

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const root = args.find((a) => !a.startsWith("--")) || "src";
const linesArg = args.find((a) => a.startsWith("--lines="));
const WINDOW = linesArg ? parseInt(linesArg.split("=")[1], 10) : 6;

const EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (EXTS.has(extname(entry))) files.push(full);
  }
  return files;
}

// Drop lines that are pure noise for duplication purposes: blank,
// import/export-only, single closing punctuation.
function isSubstantive(line) {
  const t = line.trim();
  if (!t) return false;
  if (/^(import|export)\s/.test(t)) return false;
  if (/^[)\]}>;,]+$/.test(t)) return false;
  if (/^\/\//.test(t)) return false;
  return true;
}

function normalize(line) {
  return line.trim().replace(/\s+/g, " ");
}

function main() {
  const files = walk(root);
  const windows = new Map(); // normalized block text -> [{file, line}]

  for (const file of files) {
    const raw = readFileSync(file, "utf8").split("\n");
    for (let i = 0; i + WINDOW <= raw.length; i++) {
      const slice = raw.slice(i, i + WINDOW);
      const substantiveCount = slice.filter(isSubstantive).length;
      if (substantiveCount < Math.ceil(WINDOW * 0.7)) continue; // skip mostly-boilerplate windows
      const key = slice.map(normalize).join("\n");
      if (!windows.has(key)) windows.set(key, []);
      windows.get(key).push({ file: relative(process.cwd(), file), line: i + 1 });
    }
  }

  // Only blocks appearing at 2+ distinct files, or 2+ non-overlapping
  // locations in the same file, are real duplication signal.
  const groups = [];
  for (const [key, locations] of windows) {
    const distinctFiles = new Set(locations.map((l) => l.file));
    const sameFileSpread = locations.some(
      (a, i) => locations.some((b, j) => i !== j && a.file === b.file && Math.abs(a.line - b.line) >= WINDOW)
    );
    if (distinctFiles.size >= 2 || sameFileSpread) {
      groups.push({ block: key, locations });
    }
  }

  // Adjacent starting lines produce overlapping windows for one real
  // duplicate region. Keep only the earliest window of each contiguous
  // run per set of locations, so one duplicate block is reported once.
  const qualifyingLocs = new Set(groups.flatMap((g) => g.locations.map((l) => `${l.file}:${l.line}`)));
  const collapsed = groups.filter((g) => {
    const isContinuation = g.locations.every((l) => qualifyingLocs.has(`${l.file}:${l.line - 1}`));
    return !isContinuation;
  });

  collapsed.sort((a, b) => b.locations.length - a.locations.length);
  const finalGroups = collapsed;

  if (asJson) {
    console.log(JSON.stringify({ window: WINDOW, groups: finalGroups }, null, 2));
  } else if (finalGroups.length === 0) {
    console.log(`architecture: no duplicate blocks (>=${WINDOW} lines) found in ${root}/`);
  } else {
    for (const g of finalGroups) {
      console.log(`\n--- duplicated ${WINDOW}-line block, ${g.locations.length} occurrences ---`);
      for (const loc of g.locations) console.log(`  ${loc.file}:${loc.line}`);
      console.log(
        g.block
          .split("\n")
          .map((l) => "    " + l)
          .join("\n")
      );
    }
    console.log(
      `\narchitecture: ${finalGroups.length} duplicate block(s) found in ${root}/ (window=${WINDOW} lines)`
    );
  }
  process.exitCode = finalGroups.length > 0 ? 1 : 0;
}

main();
