#!/usr/bin/env node
// AI-specific static checks for the companion feature. Generic Server/
// Client boundary and bundle-size checks already live in the `performance`
// skill — this only covers what's specific to LLM integration. No deps.
// Node >= 18.
//
// Usage: node .claude/skills/ai-companion/scripts/audit-companion.mjs [path]

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const root = args.find((a) => !a.startsWith("--")) || "src";

// Where centralized AI/provider logic is expected to live. Route handlers
// under src/app/**/route.ts are the one other legitimate place server-only
// AI SDK calls belong (they're never bundled client-side).
const AI_LIB_DIR = "src/lib/ai";
const EXTS = new Set([".ts", ".tsx"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

const SERVER_ONLY_AI_IMPORT_RE =
  /from\s+["'](ai|@ai-sdk\/(?:anthropic|openai|google|xai|groq|openai-compatible))["']/;
const USE_CLIENT_RE = /^\s*["']use client["']\s*;?\s*$/m;
const PROVIDER_CALL_RE = /\b(streamText|generateText|createProviderRegistry)\s*\(/;
const PROVIDER_IMPORT_RE = /from\s+["']@ai-sdk\/(anthropic|openai|google|xai|groq)["']/;
const SECRET_RE = /\b(sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{20,})\b/;
const ENV_ASSIGNED_KEY_RE =
  /\b(ANTHROPIC|OPENAI|GOOGLE|XAI|GROQ)_API_KEY\s*[:=]\s*["'][^"']+["']/;
const USE_CHAT_IMPORT_RE = /import\s*\{[^}]*\buseChat\b[^}]*\}\s*from\s*["'](?:@ai-sdk\/react|ai\/react)["']/;

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

function isRouteHandler(relPath) {
  return /^src\/app\/.*\/route\.tsx?$/.test(relPath.replace(/\\/g, "/"));
}

function isAiLibFile(relPath) {
  return relPath.replace(/\\/g, "/").startsWith(AI_LIB_DIR + "/");
}

function auditFile(path, findings, providerUsageFiles) {
  const text = readFileSync(path, "utf8");
  const rel = relative(process.cwd(), path).replace(/\\/g, "/");
  const isClient = USE_CLIENT_RE.test(text);

  if (isClient && SERVER_ONLY_AI_IMPORT_RE.test(text)) {
    findings.push({
      file: rel,
      rule: "server-only-ai-import-in-client",
      detail:
        "\"use client\" file imports server-only AI SDK code (ai / @ai-sdk/<provider>). This bundles provider logic (and reads of API keys) into client JS — move the call behind a route handler and call it via fetch/useChat instead.",
    });
  }

  for (const m of text.matchAll(new RegExp(SECRET_RE, "g"))) {
    findings.push({
      file: rel,
      rule: "hardcoded-secret",
      detail: `Looks like a hardcoded API key/token: "${m[0].slice(0, 12)}..." — read it from process.env on the server only.`,
    });
  }
  if (ENV_ASSIGNED_KEY_RE.test(text)) {
    findings.push({
      file: rel,
      rule: "hardcoded-secret",
      detail: "API key assigned as a string literal instead of read from process.env.",
    });
  }

  if ((PROVIDER_CALL_RE.test(text) || PROVIDER_IMPORT_RE.test(text)) && !isAiLibFile(rel) && !isRouteHandler(rel)) {
    providerUsageFiles.push(rel);
  }

  if (USE_CHAT_IMPORT_RE.test(text)) {
    if (!/\.error\b|\berror\s*[,}]/.test(text)) {
      findings.push({
        file: rel,
        rule: "chat-hook-missing-error-state",
        detail: "useChat() is used but `error` is never referenced — likely no error/retry UI.",
      });
    }
    if (!/\bstatus\b/.test(text)) {
      findings.push({
        file: rel,
        rule: "chat-hook-missing-status-state",
        detail: "useChat() is used but `status` is never referenced — likely no loading/streaming indicator.",
      });
    }
  }
}

function main() {
  const rootIsDir = statSync(root).isDirectory();
  const files = rootIsDir ? walk(root) : [root];
  const findings = [];
  const providerUsageFiles = [];

  for (const file of files) auditFile(file, findings, providerUsageFiles);

  const distinctProviderFiles = [...new Set(providerUsageFiles)];
  if (distinctProviderFiles.length > 1) {
    findings.push({
      file: distinctProviderFiles.join(", "),
      rule: "scattered-provider-config",
      detail: `AI SDK provider calls/imports found outside ${AI_LIB_DIR}/ in ${distinctProviderFiles.length} files — centralize model/provider setup in one registry module instead of duplicating it per call site.`,
    });
  }

  if (asJson) {
    console.log(JSON.stringify({ findings }, null, 2));
  } else if (findings.length === 0) {
    console.log(`ai-companion audit: 0 findings across ${files.length} files in ${root}`);
  } else {
    for (const f of findings) {
      console.log(`[${f.rule}] ${f.file}\n    ${f.detail}`);
    }
    console.log(`\nai-companion audit: ${findings.length} finding(s) in ${root}`);
  }
  process.exitCode = findings.length > 0 ? 1 : 0;
}

main();
