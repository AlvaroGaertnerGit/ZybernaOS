#!/usr/bin/env node
// Check for an existing component — locally or in the shadcn registry —
// before building a new one. No deps beyond the shadcn CLI (already a
// project dependency). Node >= 18.
//
// Usage: node .claude/skills/ui-components/scripts/find-component.mjs <query>

import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative, extname, basename } from "node:path";

const query = process.argv[2];
if (!query || !/^[\w\s-]+$/.test(query)) {
  console.error(
    'Usage: find-component.mjs <query>  (e.g. "dialog", "card", "date picker" — letters, digits, spaces, hyphens only)'
  );
  process.exit(2);
}

const COMPONENTS_ROOT = "src/components";
const q = query.toLowerCase();

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (extname(entry) === ".tsx") files.push(full);
  }
  return files;
}

function localMatches() {
  return walk(COMPONENTS_ROOT)
    .map((f) => ({ file: relative(process.cwd(), f), name: basename(f, ".tsx") }))
    .filter((c) => c.name.toLowerCase().includes(q) || c.file.toLowerCase().includes(q));
}

function registryMatches() {
  try {
    // query is pre-validated against /^[\w\s-]+$/ above, so it's safe to
    // interpolate into a quoted shell string (no quotes/metacharacters possible).
    const out = execSync(
      `npx shadcn search @shadcn -q "${query}" --type ui,block --json`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const data = JSON.parse(out);
    return data.items ?? [];
  } catch (err) {
    console.warn(
      `(registry search failed — offline or CLI error, continuing with local-only results)\n${err.message.split("\n")[0]}`
    );
    return null; // distinguish "no network" from "searched, zero results"
  }
}

const local = localMatches();
const registry = registryMatches();

console.log(`\nSearch: "${query}"\n`);

console.log("Already in this project:");
if (local.length === 0) {
  console.log("  (none)");
} else {
  for (const c of local) console.log(`  ${c.name}  —  ${c.file}`);
}

console.log("\nAvailable in the shadcn registry (not yet installed):");
if (registry === null) {
  console.log("  (skipped — see warning above)");
} else {
  const installed = new Set(local.map((c) => c.name.toLowerCase()));
  const notInstalled = registry.filter((i) => !installed.has(i.name.toLowerCase()));
  if (notInstalled.length === 0) {
    console.log("  (none)");
  } else {
    for (const i of notInstalled) {
      console.log(`  ${i.name}  —  npx shadcn add ${i.addCommandArgument ?? i.name}`);
    }
  }
}

if (local.length === 0 && (registry === null || registry.length === 0)) {
  console.log(
    "\nNo existing match. Before building new: check near-synonyms manually " +
      "(e.g. \"modal\" vs \"dialog\", \"select\" vs \"combobox\"), then use a template " +
      "from .claude/skills/ui-components/templates/."
  );
}
