# Performance review checklist (manual — not statically checkable)

Grounded against this project's actual dependencies: Next.js 16.2.12 (App
Router, Turbopack), React 19.2.4, `framer-motion` 12, `lucide-react`. Run
`scripts/audit.mjs` and `scripts/bundle-report.mjs` first — this checklist
covers what regex can't catch.

## Rendering strategy per route

For every route (`src/app/**/page.tsx`), decide deliberately, don't default:

- **Fully static** (no per-request data): the default. No `fetch` with
  `cache: "no-store"`, no `export const dynamic = "force-dynamic"` unless
  the route genuinely needs per-request data (auth-gated content, live
  search results, etc.).
- **Static + revalidate**: content that changes but not per-request (a blog
  post list, project data) → `fetch(url, { next: { revalidate: N } })`
  instead of forcing full dynamic rendering.
- **Streaming for slow data**: if a route awaits a slow fetch/DB call,
  wrap the slow part in `<Suspense>` with a lightweight fallback and move
  the fetch into the child — don't block the whole page's first byte on
  the slowest piece of data. `loading.tsx` at the route level is the
  coarse version of this; nested `<Suspense>` around a specific slow
  section is the precise version.
- Check every `export const dynamic`, `export const revalidate`, and
  `export const fetchCache` in `src/app/**` — each one is a deliberate
  perf/freshness trade-off. Flag any that look copy-pasted without a
  reason.

## Server vs. Client Components (the real trade-off)

`"use client"` only extends **downward** into that file's module graph —
a Server Component parent can render a Client Component child without
becoming client itself, and a Client Component can still receive
Server-rendered content via `children`/props (see
`reference/checklist.md` companion pattern below). Use that to push the
boundary as far down (as small) as possible:

```tsx
// Server Component (default, no directive)
import Header from "./header";      // Server Component
import Counter from "./counter";    // "use client" — owns its own state

export default function Page() {
  return (
    <div>
      <Header />   {/* stays server-rendered, zero JS shipped */}
      <Counter />  {/* only this subtree's JS ships to the client */}
    </div>
  );
}
```

- A `"use client"` component can still accept Server Component output as
  `children` — e.g. a client-side `<Modal>` wrapping a server-fetched
  `<Cart>`. Prefer this over converting the whole subtree to client just
  because one interactive wrapper needs it.
- Every new component: ask "does this need state, effects, event
  handlers, or a browser API?" If no, it's a Server Component by default
  — don't add the directive preemptively "to be safe."
- `audit.mjs`'s `use-client-route-boundary` and `use-client-no-interactivity`
  rules catch the mechanical cases; the judgment call of "should this
  20-line wrapper really own the client boundary, or should I extract the
  3 lines that actually need it" is yours.

## Hydration

- Never render `Date.now()`, `Math.random()`, or `typeof window !== "undefined"`-gated
  content directly in a component body that renders on both server and
  client — the SSR output won't match the client's first render and React
  will warn/mismatch. Compute it in `useEffect` and store in state instead,
  or accept the value as a prop from a stable source.
- Anything reading `window`, `document`, `localStorage`, or `navigator` at
  module scope (not inside an effect/handler) breaks SSR entirely for that
  module — guard it in `useEffect` or a client-only dynamic import
  (`next/dynamic` with `ssr: false`).
- `next-themes` (already a dependency here) is the correct pattern for
  theme-dependent UI that must avoid a flash/mismatch — don't hand-roll a
  `localStorage` theme read in a component body.

## Core Web Vitals — what maps to what

| Vital | What moves it in this project |
|---|---|
| **LCP** (Largest Contentful Paint) | The hero image/heading's render time. Use `preload` (not the deprecated `priority`, see below) on the actual LCP image, self-hosted fonts via `next/font` (no external round-trip), and keep the LCP element out of a `"use client"` subtree that has to hydrate before it paints. |
| **INP** (Interaction to Next Paint) | Total JS a route ships and executes before it's interactive. Every unnecessary `"use client"` boundary and every non-deferred heavy import (`scripts/audit.mjs` catches both) directly taxes this. |
| **CLS** (Cumulative Layout Shift) | Images without explicit `width`/`height` or `fill`+`sizes`, `next/dynamic` components without a sized `loading` fallback, and web fonts without `next/font` (which sets `size-adjust` automatically to prevent swap-induced shift). |

## next/image specifics (Next.js 16)

- `priority` is **deprecated** in this Next.js version — use `preload`
  instead. They can't be combined, and both disable lazy-loading for that
  image (use on the actual LCP image only, not every image on the page).
  `audit.mjs` flags existing `priority` usage
  (`image-deprecated-priority-prop`) — `src/app/page.tsx` currently has one.
- `fill` always needs `sizes` — without it Next.js assumes the image is
  100vw and serves a source sized for the full viewport even inside a
  narrow card/grid cell.
- Below-the-fold images: don't set `preload`/`priority` — let the default
  lazy-loading behavior work. Next.js's dev-mode `PerformanceObserver`
  will warn in the console if it detects the actual LCP image was
  lazy-loaded, so check the browser console during review too.

## Fonts

- `next/font/google` (already used correctly in `src/app/layout.tsx` for
  Geist Sans/Mono) downloads font files at **build time** and self-hosts
  them from the same origin — zero runtime requests to Google, zero
  render-blocking third-party connection. Any `<link href="fonts.googleapis.com/...">`
  or `@import url(fonts.googleapis.com/...)` in CSS regresses this;
  `audit.mjs`'s `google-fonts-external-request` rule catches it.
- New fonts (self-hosted local files, e.g. a brand display face) should go
  through `next/font/local`, not a raw `@font-face` in `globals.css` — you
  lose automatic `size-adjust`/fallback-metric matching (which is what
  actually prevents the layout shift) if you hand-roll it.

## Dynamic imports / lazy loading — when it's worth it

Not everything needs `next/dynamic`. Reach for it when a component is:

- Below the fold and non-trivial in size (a chart, editor, map — see
  `HEAVY_PACKAGES` in `scripts/audit.mjs` for the current watch-list).
- Conditionally rendered (a modal, a tab panel that's usually closed) —
  `showMore && <Dynamic />` means the code never loads until the condition
  is true.
- Browser-API-dependent (`ssr: false`) — anything that would crash or
  no-op during SSR anyway shouldn't be in the server bundle at all.

Don't wrap something in `dynamic()` if it's small, above the fold, or
needed for the LCP — the extra network round-trip and loading-state flash
costs more than the bytes saved.

## Bundle size

Run `scripts/bundle-report.mjs --build` (or without `--build` if
`.next/` is already fresh) after any change that adds a dependency or a
new route. Watch for:

- The **baseline** total (framework/runtime JS shipped on every route)
  creeping up — that's not code-splittable, so it should only grow when
  you deliberately add something app-wide (a new provider, a global
  script).
- Individual **non-baseline** chunks over the 50 KB gzip flag — trace
  which route/component pulled it in and decide if it belongs behind
  `next/dynamic`.
