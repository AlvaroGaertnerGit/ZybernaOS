#!/usr/bin/env node
// Lint portfolio copy for AI-tell clichés and readability. No deps.
// Node >= 18. Works on .md/.mdx/.txt (raw text) and .tsx/.jsx (extracts
// JSX text nodes + common string-literal props/fields).
//
// Usage: node .claude/skills/portfolio-writing/scripts/lint-copy.mjs <file> [file...] [--json]

import { readFileSync } from "node:fs";
import { extname } from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const files = args.filter((a) => !a.startsWith("--"));

if (files.length === 0) {
  console.error("Usage: lint-copy.mjs <file> [file...] [--json]");
  process.exit(2);
}

// Phrases that read as generic AI-generated marketing copy. Matched as
// whole phrases, case-insensitive. Keep this list to phrases that are
// near-always a rewrite opportunity, not merely common English.
const CLICHES = [
  "delve into", "dive into", "in today's fast-paced world", "in today's digital age",
  "in the ever-evolving", "navigate the landscape", "navigate the complexities",
  "unlock the power of", "unlock your", "harness the power of", "leverage the power of",
  "seamlessly integrate", "seamless integration", "cutting-edge", "state-of-the-art",
  "game-changer", "game changer", "revolutionize", "revolutionary", "unparalleled",
  "empower you to", "elevate your", "next-level", "top-notch", "world-class",
  "best-in-class", "a testament to", "stands as a testament", "showcasing my",
  "it's important to note that", "it is important to note that", "needless to say",
  "at the end of the day", "in conclusion", "in summary", "as we can see",
  "boasts a", "robust and scalable", "innovative solution", "innovative solutions",
  "passionate about creating", "passion for technology", "wide range of",
  "plethora of", "myriad of", "in order to", "utiliz",
];
const CLICHE_RE = new RegExp(`\\b(${CLICHES.map(escapeRe).join("|")})`, "gi");

// Sentence-initial connective tissue that piles up when overused.
const CONNECTIVE_RE = /^(furthermore|moreover|additionally|in addition)\b/gim;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractText(path) {
  const raw = readFileSync(path, "utf8");
  if (![".tsx", ".jsx"].includes(extname(path))) return raw;

  const chunks = [];
  // JSX text nodes: content between `>` and the next `<`.
  for (const m of raw.matchAll(/>([^<>{}\n][^<>{}]*)</g)) {
    const t = m[1].trim();
    if (t && /[a-zA-Z]{3,}/.test(t)) chunks.push(t);
  }
  // Common copy-bearing string literal fields.
  for (const m of raw.matchAll(
    /\b(title|description|alt|aria-label|summary|excerpt)\s*:\s*(['"`])((?:(?!\2).)*)\2/g
  )) {
    chunks.push(m[3]);
  }
  return chunks.join("\n");
}

function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

function readability(text) {
  const words = text.match(/[A-Za-z'-]+/g) || [];
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z"'])/).filter((s) => s.trim().length > 0);
  const wordCount = words.length;
  const sentenceCount = Math.max(1, sentences.length);
  const syllables = words.reduce((n, w) => n + countSyllables(w), 0);

  const avgWordsPerSentence = wordCount / sentenceCount;
  const avgSyllablesPerWord = wordCount ? syllables / wordCount : 0;
  const fleschReadingEase =
    206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

  const emDashes = (text.match(/—/g) || []).length;
  const emDashPer100Words = wordCount ? (emDashes / wordCount) * 100 : 0;

  return { wordCount, sentenceCount, avgWordsPerSentence, fleschReadingEase, emDashPer100Words };
}

function lintFile(path) {
  const text = extractText(path);
  const findings = [];

  for (const m of text.matchAll(CLICHE_RE)) {
    findings.push({ rule: "ai-cliche", match: m[0] });
  }
  for (const m of text.matchAll(CONNECTIVE_RE)) {
    findings.push({ rule: "connective-tissue", match: m[0] });
  }

  const r = readability(text);
  if (r.wordCount >= 15) {
    if (r.avgWordsPerSentence > 26) {
      findings.push({
        rule: "long-sentences",
        match: `avg ${r.avgWordsPerSentence.toFixed(1)} words/sentence`,
      });
    }
    if (r.fleschReadingEase < 40) {
      findings.push({
        rule: "low-readability",
        match: `Flesch reading ease ${r.fleschReadingEase.toFixed(0)} (aim for 50+)`,
      });
    }
    if (r.emDashPer100Words > 3) {
      findings.push({
        rule: "em-dash-overuse",
        match: `${r.emDashPer100Words.toFixed(1)} em dashes per 100 words`,
      });
    }
  }

  return { text, readability: r, findings };
}

const report = files.map((f) => ({ file: f, ...lintFile(f) }));

if (asJson) {
  console.log(JSON.stringify(report.map(({ text, ...rest }) => rest), null, 2));
} else {
  let total = 0;
  for (const { file, readability: r, findings } of report) {
    total += findings.length;
    console.log(`\n${file}  (${r.wordCount} words, Flesch ${r.fleschReadingEase.toFixed(0)})`);
    if (findings.length === 0) {
      console.log("  clean");
      continue;
    }
    for (const f of findings) {
      console.log(`  [${f.rule}] ${f.match}`);
    }
  }
  console.log(`\nportfolio-writing lint: ${total} finding(s) across ${report.length} file(s)`);
  process.exitCode = total > 0 ? 1 : 0;
}
