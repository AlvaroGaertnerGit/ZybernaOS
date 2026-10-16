#!/usr/bin/env node
// Prints the project's design tokens (source of truth: src/app/globals.css)
// so an agent can reuse before creating. No deps. Node >= 18.
// Usage: node .claude/skills/design-system/scripts/list-tokens.mjs [--json]

import { readFileSync } from "node:fs";

const CSS_PATH = "src/app/globals.css";
const asJson = process.argv.includes("--json");

function parseBlock(text, selector) {
  const re = new RegExp(`${selector}\\s*{([^}]*)}`, "s");
  const match = text.match(re);
  if (!match) return {};
  const vars = {};
  for (const line of match[1].split("\n")) {
    const m = line.trim().match(/^--([\w-]+):\s*(.+?);?\s*$/);
    if (m) vars[m[1]] = m[2].replace(/;$/, "").trim();
  }
  return vars;
}

function main() {
  const css = readFileSync(CSS_PATH, "utf8");
  const light = parseBlock(css, ":root");
  const dark = parseBlock(css, "\\.dark");
  const themeMap = parseBlock(css, "@theme inline");

  const names = [...new Set([...Object.keys(light), ...Object.keys(dark)])];

  const colorTokens = names.filter((n) => n !== "radius" && !n.startsWith("font-"));
  const otherTokens = names.filter((n) => n === "radius" || n.startsWith("font-"));

  const radiusUtilities = Object.entries(themeMap).filter(([k]) => k.startsWith("radius-"));

  if (asJson) {
    console.log(JSON.stringify({ light, dark, themeMap, radiusUtilities }, null, 2));
    return;
  }

  console.log(`Design tokens — source: ${CSS_PATH}\n`);

  console.log("Color tokens (use as bg-<name> / text-<name> / border-<name> / ring-<name>):");
  for (const name of colorTokens) {
    const l = light[name] ?? "—";
    const d = dark[name] ?? "(same as light)";
    console.log(`  --${name}`.padEnd(28) + `light: ${l}`.padEnd(30) + `dark: ${d}`);
  }

  if (otherTokens.length) {
    console.log("\nOther tokens:");
    for (const name of otherTokens) {
      console.log(`  --${name}: ${light[name] ?? dark[name]}`);
    }
  }

  if (radiusUtilities.length) {
    console.log("\nRadius scale (rounded-{sm,md,lg,xl,2xl,3xl,4xl}):");
    for (const [k, v] of radiusUtilities) {
      console.log(`  --${k}: ${v}`);
    }
  }

  console.log(
    "\nBefore adding a new token: check this list first. If nothing fits, add the pair to" +
      " :root/.dark in globals.css (oklch, semantic name) and map it in @theme inline."
  );
}

main();
