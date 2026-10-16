# Motion tokens

The full set lives in `src/lib/motion/` — one small file per token family
(`durations.ts`, `easings.ts`, `springs.ts`, `transitions.ts`, `viewport.ts`,
`distances.ts`), barreled by `src/lib/motion/index.ts` so
`import { duration, easing } from "@/lib/motion"` still resolves regardless
of the split (copy `templates/motion.ts` as a starting point if the
directory is missing, then split it). This file explains *why* each value
exists so you can pick the right one instead of guessing.

## Durations

| Token      | Value | Use for |
|------------|-------|---------|
| `instant`  | 0.1s  | Tap/press feedback, color/opacity micro-changes on interactive elements |
| `fast`     | 0.15s | Hover states, tooltips, small icon transitions |
| `base`     | 0.25s | Default — most enter/exit transitions, card reveals, menu open/close |
| `slow`     | 0.4s  | Modals, drawers, larger surfaces entering the viewport |
| `slower`   | 0.6s  | Hero/page-level entrances, large layout moves |

If a motion doesn't obviously map to one of these, it's almost always
`base`. Nothing in this project should animate slower than `slower` (0.6s) —
past that, motion reads as sluggish, not premium.

## Easings

Bezier curves only — `src/lib/motion/easings.ts`. Spring physics is a
structurally different `Transition` shape (see Springs below), not another
easing, which is why it lives in its own file rather than under `easing`.

| Token     | Curve                          | Use for |
|-----------|---------------------------------|---------|
| `out`     | `cubic-bezier(0.16, 1, 0.3, 1)` | Default for entrances/exits — fast start, gentle settle. This is the project's signature "premium decelerate" feel. |
| `inOut`   | `cubic-bezier(0.4, 0, 0.2, 1)`  | Toggles, interruptible/looping transitions (e.g. tab indicators, theme switches) where motion starts and ends at rest on both sides |

Rule of thumb: **content appearing/disappearing → `out`. State toggling
back and forth → `inOut`. Something the user is physically pushing →
a spring, below.**

Never use `"linear"` — it has no place in UI motion, it reads as
mechanical/broken.

## Springs

`src/lib/motion/springs.ts`. Deliberately just one named spring today —
nothing in the app drives a Framer spring yet (a character's own physics,
if any, should stay independent of this shared file, not sourced from it).
Add a second named spring only when a concrete Framer-driven surface needs
different physics — don't seed variants speculatively.

| Token    | Value | Use for |
|----------|-------|---------|
| `layout` | `{ type: "spring", stiffness: 420, damping: 32 }` | Interactive, physically-driven motion — drag, button press, layout animations (`layout` prop), anything the user's input should feel connected to |

## Transitions

`src/lib/motion/transitions.ts` — ready-made `Transition` objects pairing a
duration with an easing (or referencing a spring), so components stop
inlining the same `{ duration, ease }` pair repeatedly. Prefer one of
these over assembling `{ duration: duration.x, ease: easing.y }` inline:
`enter` (default enter/exit), `enterSlow` (Hero/page-level entrances),
`hover`, `press`, `toggle`.

## Viewport

`src/lib/motion/viewport.ts` exports `defaultViewport` — the baseline
`{ once: true, amount }` config `Reveal` merges in automatically. Override
per-call via `Reveal`'s `viewport` prop only when a specific reveal genuinely
needs a different trigger amount; `once: true` always wins regardless of
what's passed (see the Golden Rules below).

## Distances

| Token | Value | Use for |
|-------|-------|---------|
| `xs`  | 4px   | Icon nudges, tiny inline elements |
| `sm`  | 8px   | Small components (badges, chips, list rows) |
| `md`  | 12px  | Default — cards, sections, most `fadeInUp`/`fadeInDown` usage |
| `lg`  | 24px  | Large surfaces (hero content, full-width sections) |

Never offset more than `lg` (24px). Large translate distances (50px+) are
what make scroll animations feel like a slideshow instead of a reveal —
they're the #1 "distracting" pattern to avoid.

## Example

```tsx
import { motion } from "framer-motion"
import { duration, easing } from "@/lib/motion"

<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: duration.base, ease: easing.out }}
/>
```

In practice, prefer reaching for a named variant (see `variants.md`) over
writing `initial`/`animate`/`transition` inline like this — inline is fine
for a genuine one-off, not for anything reused across components.
