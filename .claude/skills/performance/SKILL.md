---
name: performance
description: Keep this Next.js (App Router) project fast. Use when writing or reviewing any component for Server vs Client Component boundaries, next/image or next/font usage, next/dynamic lazy loading, bundle size, rendering strategy, hydration, or Core Web Vitals — or when asked to audit/review performance, find unnecessary "use client" directives, check bundle size, or optimize a page.
---

Two static-analysis scripts plus a manual checklist — same shape as the
`design-system` skill's `audit.mjs`. Don't guess whether a pattern is a
regression; run the script.

## Before writing or reviewing any component

1. **Default to a Server Component.** Only add `"use client"` when the
   component actually needs state, effects, event handlers, or a browser
   API. Never add it "to be safe," and never put it on a route-level
   `page.tsx`/`layout.tsx` if the interactive part is a small piece of a
   mostly-static tree — extract that piece into its own client leaf
   instead.
2. **Images**: always `next/image`, never `<img>`. `fill` always pairs
   with `sizes`. Use `preload` (not `priority` — deprecated in this
   Next.js version) on the actual LCP image only.
3. **Fonts**: always `next/font/google` or `next/font/local`, never a
   `fonts.googleapis.com` `<link>`/`@import`.
4. **Heavy or below-the-fold components**: reach for `next/dynamic` with
   a `loading` fallback (and `ssr: false` if it's browser-only). See
   `reference/checklist.md` for when it's and isn't worth it.

## After writing or changing code

Run the audit — it must return 0 findings for anything you touched:

```bash
node .claude/skills/performance/scripts/audit.mjs src
```

Flags, per file:line, with a fix suggestion:

| Rule | Catches |
|---|---|
| `use-client-route-boundary` | `"use client"` on a `page`/`layout`/`template`/`default.tsx` — forces the whole subtree client-side |
| `use-client-no-interactivity` | `"use client"` file with no hooks/handlers/browser APIs detected — likely doesn't need the boundary |
| `raw-img-tag` | `<img>` instead of `next/image`'s `<Image>` |
| `image-missing-alt` | `<Image>` without `alt=` |
| `image-fill-missing-sizes` | `<Image fill>` without `sizes=` — downloads an oversized source |
| `image-deprecated-priority-prop` | `priority` on `<Image>` — deprecated in this Next.js version, use `preload` |
| `google-fonts-external-request` | Google Fonts loaded via URL instead of `next/font/google` |
| `dynamic-import-missing-loading` | `next/dynamic()` without a `loading` fallback |
| `heavy-static-import` | Static top-level import of a known-heavy package (chart/editor/map/pdf libs, see `HEAVY_PACKAGES` in the script) — dynamic-import candidate |
| `barrel-namespace-import` | `import * as X from "lucide-react"` (or similar icon barrel) — defeats tree-shaking |

`--json` gives machine-readable output. Exit code is `1` if findings
exist, `0` if clean.

## Checking bundle size

```bash
node .claude/skills/performance/scripts/bundle-report.mjs --build
```

(Drop `--build` to reuse an existing `.next/` from a prior build.) Reports
real gzip sizes — not estimates — for the JS baseline shipped on every
route and the heaviest individual chunks, flagging any non-baseline chunk
over 50 KB gzip as a `next/dynamic` candidate. Next.js 16's Turbopack
build no longer prints a First Load JS table in `next build` stdout, so
this reads `.next/build-manifest.json` and `.next/static/chunks/` directly
— verified against this project's own build output.

## Rules enforced by hand (not statically checkable)

Read `reference/checklist.md` for the full detail. In short:

- **Rendering strategy** — pick static / static+revalidate / streaming
  deliberately per route; don't default to `force-dynamic`.
- **Hydration** — no `Date.now()`/`Math.random()`/`window` reads directly
  in a component body that renders on both server and client.
- **Core Web Vitals mapping** — which category (images, fonts, JS,
  RSC boundaries) moves LCP vs. INP vs. CLS, so a fix targets the metric
  that actually matters for that page.

## When you find a regression

Don't silently work around it — report it: which rule (or which manual
checklist item), file/line, and the fix. If the same anti-pattern shows
up in 2+ places (e.g. the same heavy library imported statically in
multiple routes), that's worth a shared `next/dynamic`-wrapped component
rather than fixing each call site separately.
