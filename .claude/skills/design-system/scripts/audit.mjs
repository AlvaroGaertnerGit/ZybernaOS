#!/usr/bin/env node
// Static audit for design-token consistency. No deps. Node >= 18.
// Usage: node .claude/skills/design-system/scripts/audit.mjs [path] [--json]

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const root = args.find((a) => !a.startsWith("--")) || "src";

const EXTS = new Set([".tsx", ".ts", ".jsx", ".js", ".css"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);
// globals.css (or any file matching) is where tokens are DEFINED — raw
// color values there are expected, not violations.
const TOKEN_DEFINITION_FILES = [/globals\.css$/];

const RAW_PALETTE = [
  "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber",
  "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue",
  "indigo", "violet", "purple", "fuchsia", "pink", "rose",
];
const PALETTE_RE = new RegExp(
  `(?:^|\\s)(?:dark:)?(?:hover:|focus:|focus-visible:|active:|disabled:|group-hover:)?` +
    `(bg|text|border|ring|from|via|to|fill|stroke|outline|divide)-` +
    `(${RAW_PALETTE.join("|")}|black|white)(?:-\\d{2,3})?(?:/\\d{1,3})?\\b`,
  "g"
);
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const COLOR_FN_RE = /\b(?:rgb|rgba|hsl|hsla)\(/g;
const ARBITRARY_SCALE_RE =
  /\b(rounded(?:-[tlbrse]{1,2})?|shadow|leading|tracking|p|m|p[xytrbl]|m[xytrbl]|gap(?:-x|-y)?|space-x|space-y|text)-\[[^\]]+\]/g;
const OUTLINE_NONE_RE = /\boutline-none\b/;
const FOCUS_VISIBLE_RE = /\bfocus-visible:/;

const RULES = {
  "raw-palette-color": {
    severity: "warn",
    message:
      "Raw Tailwind palette color used instead of a semantic design token (bg-background, text-foreground, bg-card, border-border, bg-muted, ...). Run list-tokens.mjs to see available tokens.",
  },
  "hardcoded-hex-color": {
    severity: "error",
    message:
      "Hardcoded hex color outside globals.css. Add/reuse a token in globals.css instead.",
  },
  "hardcoded-color-function": {
    severity: "error",
    message:
      "Hardcoded rgb()/hsl() color outside globals.css. Add/reuse a token in globals.css instead.",
  },
  "arbitrary-scale-value": {
    severity: "warn",
    message:
      "Arbitrary bracket value on a utility that has a design-token scale (spacing, radius, shadow, type). Prefer the closest scale step (p-4, rounded-lg, text-sm, ...).",
  },
  "missing-focus-visible": {
    severity: "error",
    message:
      "outline-none used without a focus-visible: replacement. Keyboard focus becomes invisible — add focus-visible:ring-* / focus-visible:border-*.",
  },
};

function shouldSkip(path) {
  return TOKEN_DEFINITION_FILES.some((re) => re.test(path));
}

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

function auditFile(path) {
  const findings = [];
  const text = readFileSync(path, "utf8");
  const isTokenFile = shouldSkip(path);
  const lines = text.split("\n");

  lines.forEach((line, i) => {
    const lineNo = i + 1;

    if (!isTokenFile) {
      for (const m of line.matchAll(PALETTE_RE)) {
        findings.push({ rule: "raw-palette-color", line: lineNo, match: m[0].trim() });
      }
      for (const m of line.matchAll(HEX_RE)) {
        findings.push({ rule: "hardcoded-hex-color", line: lineNo, match: m[0] });
      }
      for (const m of line.matchAll(COLOR_FN_RE)) {
        findings.push({ rule: "hardcoded-color-function", line: lineNo, match: m[0] });
      }
    }

    for (const m of line.matchAll(ARBITRARY_SCALE_RE)) {
      // e.g. rounded-[min(var(--radius-md),10px)] consumes a token via
      // arbitrary-value syntax — that's token reuse, not a hardcoded value.
      if (m[0].includes("var(--")) continue;
      findings.push({ rule: "arbitrary-scale-value", line: lineNo, match: m[0] });
    }

    if (OUTLINE_NONE_RE.test(line) && !FOCUS_VISIBLE_RE.test(line)) {
      findings.push({ rule: "missing-focus-visible", line: lineNo, match: "outline-none" });
    }
  });

  return findings;
}

function main() {
  const files = statSync(root).isDirectory() ? walk(root) : [root];
  const report = [];

  for (const file of files) {
    const findings = auditFile(file);
    if (findings.length) {
      report.push({ file: relative(process.cwd(), file), findings });
    }
  }

  const totalFindings = report.reduce((n, r) => n + r.findings.length, 0);

  if (asJson) {
    console.log(JSON.stringify({ files: report, totalFindings }, null, 2));
  } else if (totalFindings === 0) {
    console.log(`design-system audit: 0 findings across ${files.length} files in ${root}`);
  } else {
    for (const { file, findings } of report) {
      console.log(`\n${file}`);
      for (const f of findings) {
        const rule = RULES[f.rule];
        console.log(`  ${f.line}:  [${f.rule}] ${JSON.stringify(f.match)}`);
        console.log(`        ${rule.message}`);
      }
    }
    console.log(
      `\ndesign-system audit: ${totalFindings} finding(s) across ${report.length} file(s) in ${root}`
    );
  }

  process.exitCode = totalFindings > 0 ? 1 : 0;
}

main();
