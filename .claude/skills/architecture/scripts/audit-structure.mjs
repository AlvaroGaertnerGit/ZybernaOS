#!/usr/bin/env node
// Structural/complexity smells: oversized files, high-branching functions,
// same-named components/modules living in different folders (likely
// accidental reinvention instead of reuse), excessive folder nesting.
// Heuristic, regex-based — not a parser. No deps. Node >= 18.
//
// Usage: node .claude/skills/architecture/scripts/audit-structure.mjs [path]
//        [--max-loc=300] [--max-complexity=10] [--max-depth=5] [--json]

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative, basename, sep } from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const root = args.find((a) => !a.startsWith("--")) || "src";
const flag = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? parseInt(a.split("=")[1], 10) : def;
};
const MAX_LOC = flag("max-loc", 300);
const MAX_COMPLEXITY = flag("max-complexity", 10);
const MAX_DEPTH = flag("max-depth", 5);

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

function extractBalanced(text, openBraceIdx) {
  let depth = 0;
  for (let i = openBraceIdx; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(openBraceIdx, i + 1);
    }
  }
  return text.slice(openBraceIdx);
}

function findFunctionBodies(text) {
  const found = [];
  for (const m of text.matchAll(/\bfunction\s+([A-Za-z0-9_$]+)\s*\(/g)) {
    const braceIdx = text.indexOf("{", m.index);
    if (braceIdx !== -1) found.push({ name: m[1], braceIdx });
  }
  for (const m of text.matchAll(
    /\b(?:export\s+)?(?:const|let)\s+([A-Za-z0-9_$]+)\s*(?::[^=]+)?=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>\s*\{/g
  )) {
    found.push({ name: m[1], braceIdx: m.index + m[0].length - 1 });
  }
  return found;
}

function complexityOf(body) {
  const decisionPoints = [
    ...body.matchAll(/\b(if|for|while|case|catch)\b/g),
    ...body.matchAll(/&&|\|\|/g),
    ...body.matchAll(/\?(?!\.)/g), // ternary, not optional-chaining `?.`
  ];
  return 1 + decisionPoints.length;
}

function auditFile(path, findings) {
  const text = readFileSync(path, "utf8");
  const rel = relative(process.cwd(), path);
  const loc = text.split("\n").length;

  if (loc > MAX_LOC) {
    findings.push({ file: rel, rule: "large-file", detail: `${loc} lines (max ${MAX_LOC})` });
  }

  for (const fn of findFunctionBodies(text)) {
    const body = extractBalanced(text, fn.braceIdx);
    const c = complexityOf(body);
    if (c > MAX_COMPLEXITY) {
      const line = text.slice(0, fn.braceIdx).split("\n").length;
      findings.push({
        file: rel,
        rule: "high-complexity",
        detail: `${fn.name}() at line ${line} — complexity ~${c} (max ${MAX_COMPLEXITY})`,
      });
    }
  }
}

function auditDuplicateNames(files, findings) {
  const byName = new Map();
  for (const f of files) {
    const name = basename(f, extname(f));
    if (["index", "page", "layout", "loading", "error", "route", "template", "default"].includes(name)) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(relative(process.cwd(), f));
  }
  for (const [name, locs] of byName) {
    const distinctDirs = new Set(locs.map((l) => l.split(sep).slice(0, -1).join(sep)));
    if (distinctDirs.size >= 2) {
      findings.push({
        file: locs.join(", "),
        rule: "duplicate-name-different-folders",
        detail: `"${name}" exists in ${distinctDirs.size} different folders — likely reinvented instead of reused/imported`,
      });
    }
  }
}

function auditDepth(files, findings) {
  for (const f of files) {
    const rel = relative(root, f);
    const depth = rel.split(sep).length - 1; // folders between root and the file
    if (depth > MAX_DEPTH) {
      findings.push({
        file: relative(process.cwd(), f),
        rule: "deep-nesting",
        detail: `${depth} folders deep under ${root}/ (max ${MAX_DEPTH})`,
      });
    }
  }
}

function main() {
  const rootIsDir = statSync(root).isDirectory();
  const files = rootIsDir ? walk(root) : [root];
  const findings = [];

  for (const file of files) auditFile(file, findings);
  if (rootIsDir) {
    auditDuplicateNames(files, findings);
    auditDepth(files, findings);
  }

  if (asJson) {
    console.log(JSON.stringify({ findings }, null, 2));
  } else if (findings.length === 0) {
    console.log(`architecture: 0 structural findings across ${files.length} files in ${root}`);
  } else {
    for (const f of findings) {
      console.log(`[${f.rule}] ${f.file}\n    ${f.detail}`);
    }
    console.log(`\narchitecture: ${findings.length} finding(s) in ${root}`);
  }
  process.exitCode = findings.length > 0 ? 1 : 0;
}

main();
