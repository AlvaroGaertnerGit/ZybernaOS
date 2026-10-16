#!/usr/bin/env node
// Static performance audit for this Next.js (App Router) project. No deps. Node >= 18.
// Usage: node .claude/skills/performance/scripts/audit.mjs [path] [--json]
//
// Checks RSC/Client boundaries, next/image usage, next/font self-hosting,
// next/dynamic lazy-loading, and known-heavy static imports. Mirrors the
// output shape of the design-system skill's audit.mjs.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative, sep } from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const root = args.find((a) => !a.startsWith("--")) || "src";

const EXTS = new Set([".tsx", ".ts", ".jsx", ".js", ".css"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

// Route-segment files: "use client" here forces the whole subtree client-side
// unless every child re-declares its own server boundary — the single most
// expensive RSC mistake in an App Router project.
const ROUTE_SEGMENT_RE = /(^|[\\/])app([\\/].*)?[\\/](page|layout|template|default)\.(tsx|jsx|ts|js)$/;

const INTERACTIVITY_RE =
  /\b(useState|useEffect|useLayoutEffect|useRef|useReducer|useContext|useTransition|useDeferredValue|useImperativeHandle|useSyncExternalStore|useOptimistic|useActionState|useFormStatus|use)\s*\(|on[A-Z]\w*\s*=|addEventListener|window\.|document\.|localStorage|sessionStorage|navigator\.|IntersectionObserver|ResizeObserver|MutationObserver|requestAnimationFrame/;

const USE_CLIENT_RE = /^["']use client["'];?\s*$/;

const GOOGLE_FONTS_RE = /fonts\.(googleapis|gstatic)\.com/;

// Packages worth lazy-loading (next/dynamic) rather than bundling into the
// initial JS payload — heavy, often below-the-fold, or browser-only.
const HEAVY_PACKAGES = [
  "three", "@react-three/fiber", "@react-three/drei",
  "recharts", "chart.js", "react-chartjs-2", "d3", "victory",
  "monaco-editor", "@monaco-editor/react", "codemirror", "@uiw/react-codemirror",
  "pdfjs-dist", "react-pdf", "@react-pdf/renderer",
  "mermaid", "katex", "react-katex",
  "react-syntax-highlighter", "prismjs", "highlight.js",
  "leaflet", "react-leaflet", "mapbox-gl", "@react-google-maps/api",
  "@tiptap/react", "quill", "draft-js",
];
const HEAVY_IMPORT_RE = new RegExp(
  `^\\s*import\\s+[^;]*\\s+from\\s+["'](${HEAVY_PACKAGES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})["']`
);

// Namespace-importing an icon/component barrel pulls the whole package into
// the graph even if only one export is used — defeats tree-shaking.
const BARREL_PACKAGES = ["lucide-react", "@radix-ui/react-icons", "react-icons"];
const NAMESPACE_IMPORT_RE = new RegExp(
  `^\\s*import\\s+\\*\\s+as\\s+\\w+\\s+from\\s+["'](${BARREL_PACKAGES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(/[\\w-]*)?["']`
);

const RULES = {
  "use-client-route-boundary": {
    severity: "error",
    message:
      "\"use client\" on a route-segment file (page/layout/template/default) forces the whole subtree to render client-side. Move the directive down to the smallest interactive leaf component instead.",
  },
  "use-client-no-interactivity": {
    severity: "warn",
    message:
      "\"use client\" file with no hooks, event handlers, or browser APIs detected. If this component is only rendering markup/props, it can likely be a Server Component — remove the directive and pass data down instead.",
  },
  "raw-img-tag": {
    severity: "error",
    message:
      "Raw <img> instead of next/image's <Image>. You lose automatic AVIF/WebP, responsive srcset, and layout-shift prevention.",
  },
  "image-missing-alt": {
    severity: "error",
    message: "<Image> without alt=. Required for accessibility and Next.js will warn at runtime.",
  },
  "image-fill-missing-sizes": {
    severity: "warn",
    message:
      "<Image fill> without sizes=. Next.js defaults to assuming the image is 100vw, which downloads a far larger source than needed on most layouts.",
  },
  "image-deprecated-priority-prop": {
    severity: "warn",
    message:
      "priority is deprecated on next/image in this Next.js version — use preload instead (priority and preload cannot be combined, and both bypass lazy-loading for the LCP image).",
  },
  "google-fonts-external-request": {
    severity: "error",
    message:
      "Google Fonts loaded via a direct URL instead of next/font/google. This adds a render-blocking third-party network request and layout shift that next/font's build-time self-hosting eliminates.",
  },
  "dynamic-import-missing-loading": {
    severity: "warn",
    message:
      "next/dynamic() without a loading option. The component pops in with no placeholder, which reads as layout shift/jank — add loading: () => <Skeleton /> (or similar).",
  },
  "heavy-static-import": {
    severity: "warn",
    message:
      "Static top-level import of a known-heavy package. If this component isn't needed for the initial paint, wrap it with next/dynamic (add ssr: false too if it touches browser-only APIs).",
  },
  "barrel-namespace-import": {
    severity: "warn",
    message:
      "Namespace import (import * as X) from an icon/component barrel pulls the entire package into the module graph. Import only the named icons/components you use.",
  },
};

function shouldSkipDir(name) {
  return SKIP_DIRS.has(name);
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (shouldSkipDir(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (EXTS.has(extname(entry))) files.push(full);
  }
  return files;
}

function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

// Extracts a balanced-paren call starting at `openParenIdx` (the '(' itself).
function extractBalanced(text, openParenIdx) {
  let depth = 0;
  for (let i = openParenIdx; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return text.slice(openParenIdx, i + 1);
    }
  }
  return text.slice(openParenIdx);
}

function auditUseClient(path, text, findings) {
  const firstLine = text.split("\n").find((l) => l.trim().length > 0);
  if (!firstLine || !USE_CLIENT_RE.test(firstLine.trim())) return;

  const normalizedPath = path.split(sep).join("/");
  if (ROUTE_SEGMENT_RE.test(normalizedPath)) {
    findings.push({ rule: "use-client-route-boundary", line: 1, match: firstLine.trim() });
  }

  const body = text.slice(text.indexOf(firstLine) + firstLine.length);
  if (!INTERACTIVITY_RE.test(body)) {
    findings.push({ rule: "use-client-no-interactivity", line: 1, match: firstLine.trim() });
  }
}

function auditImages(path, text, findings) {
  const isJsx = /\.(tsx|jsx)$/.test(path);
  if (!isJsx) return;

  for (const m of text.matchAll(/<img[\s>]/g)) {
    findings.push({ rule: "raw-img-tag", line: lineAt(text, m.index), match: "<img" });
  }

  for (const m of text.matchAll(/<Image\b[\s\S]*?\/>/g)) {
    const block = m[0];
    const line = lineAt(text, m.index);
    if (!/\balt\s*=/.test(block)) {
      findings.push({ rule: "image-missing-alt", line, match: block.slice(0, 40).replace(/\s+/g, " ") + "…" });
    }
    if (/\bfill\b(?!\w)/.test(block) && !/\bsizes\s*=/.test(block)) {
      findings.push({ rule: "image-fill-missing-sizes", line, match: block.slice(0, 40).replace(/\s+/g, " ") + "…" });
    }
    if (/\bpriority\b(?!\w)/.test(block)) {
      findings.push({ rule: "image-deprecated-priority-prop", line, match: "priority" });
    }
  }
}

function auditFonts(path, text, findings) {
  for (const m of text.matchAll(new RegExp(GOOGLE_FONTS_RE, "g"))) {
    findings.push({ rule: "google-fonts-external-request", line: lineAt(text, m.index), match: m[0] });
  }
}

function auditDynamicImports(path, text, findings) {
  if (!/from\s+["']next\/dynamic["']/.test(text)) return;

  const callRe = /\bdynamic\s*(\()/g;
  for (const m of text.matchAll(callRe)) {
    const openIdx = m.index + m[0].length - 1;
    const call = extractBalanced(text, openIdx);
    if (!/loading\s*:/.test(call)) {
      findings.push({ rule: "dynamic-import-missing-loading", line: lineAt(text, m.index), match: "dynamic(...)" });
    }
  }
}

function auditHeavyImports(path, text, findings) {
  for (const [i, line] of text.split("\n").entries()) {
    if (HEAVY_IMPORT_RE.test(line)) {
      findings.push({ rule: "heavy-static-import", line: i + 1, match: line.trim() });
    }
    if (NAMESPACE_IMPORT_RE.test(line)) {
      findings.push({ rule: "barrel-namespace-import", line: i + 1, match: line.trim() });
    }
  }
}

function auditFile(path) {
  const findings = [];
  const text = readFileSync(path, "utf8");

  auditUseClient(path, text, findings);
  auditImages(path, text, findings);
  auditFonts(path, text, findings);
  auditDynamicImports(path, text, findings);
  auditHeavyImports(path, text, findings);

  return findings;
}

function main() {
  const files = walk(root);
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
    console.log(`performance audit: 0 findings across ${files.length} files in ${root}/`);
  } else {
    for (const { file, findings } of report) {
      console.log(`\n${file}`);
      for (const f of findings) {
        const rule = RULES[f.rule];
        console.log(`  ${f.line}:  [${f.rule}] (${rule.severity}) ${JSON.stringify(f.match)}`);
        console.log(`        ${rule.message}`);
      }
    }
    console.log(
      `\nperformance audit: ${totalFindings} finding(s) across ${report.length} file(s) in ${root}/`
    );
  }

  process.exitCode = totalFindings > 0 ? 1 : 0;
}

main();
