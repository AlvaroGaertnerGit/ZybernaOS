---
name: design-system
description: Maintain this project's design system (Tailwind v4 + shadcn tokens for color, radius, typography, shadow, spacing, defined in src/app/globals.css). Use whenever creating or styling UI, adding a component, choosing colors/spacing/radius, or when asked to audit design consistency, find hardcoded colors, list design tokens, or check accessibility of a component.
---

Source of truth: `src/app/globals.css` (`:root` / `.dark` custom properties,
mapped in `@theme inline`). Reusable primitives live in `src/components/ui/`,
built with `cva` (see `button.tsx`) and merged with `cn()` from
`src/lib/utils.ts`. Never restate token values from memory — the tokens
change; the commands below don't.

## Before writing any className

1. **List current tokens** — don't guess a color/radius, don't reuse a
   value you remember from last session:

   ```bash
   node .claude/skills/design-system/scripts/list-tokens.mjs
   ```

   Map every color to a semantic token (`bg-background`, `text-foreground`,
   `bg-card`, `border-border`, `bg-muted`, `bg-primary`, ...), never a raw
   Tailwind palette class (`bg-zinc-50`, `text-black`) or a hex/rgb literal.
   Use the radius scale (`rounded-sm` … `rounded-4xl`) instead of arbitrary
   px/rem.

2. **Reuse before creating.** If an existing `src/components/ui/*`
   primitive covers the case, use/extend it via its `cva` `variant`/`size`
   props (composition) rather than styling a one-off element inline. Only
   add a new token to `globals.css` when nothing in the list above fits —
   add the pair to both `:root` and `.dark` in `oklch`, name it
   semantically (what it's *for*, not its color), then map it under
   `@theme inline`.

## After writing or changing UI

Run the audit — it must return 0 findings for anything you touched:

```bash
node .claude/skills/design-system/scripts/audit.mjs src
```

Flags, per file:line, with a fix suggestion:

| Rule | Catches |
|---|---|
| `raw-palette-color` | `bg-zinc-50`, `text-black`, `dark:bg-neutral-900`, etc. instead of a semantic token |
| `hardcoded-hex-color` / `hardcoded-color-function` | `#383838`, `rgb(...)`, `hsl(...)` outside `globals.css` |
| `arbitrary-scale-value` | `p-[13px]`, `rounded-[8px]`, `text-[15px]` — bypasses the spacing/radius/type scale. (Arbitrary values that reference `var(--token)`, e.g. `rounded-[min(var(--radius-md),10px)]`, are exempt — that's token reuse, not a hardcode.) |
| `missing-focus-visible` | `outline-none` with no `focus-visible:` replacement — keyboard focus becomes invisible |

`--json` gives machine-readable output for scripting. Exit code is `1` if
findings exist, `0` if clean.

Pre-existing findings in vendored/generated `src/components/ui/*` files
(from `shadcn` CLI output) are not yours to fix opportunistically — only
resolve findings in files you're actually changing.

## Rules enforced by hand (not statically checkable)

- **Mobile-first**: unprefixed classes are the mobile layout; add
  `sm:`/`md:`/`lg:` to progressively enhance. Never author a desktop-first
  override.
- **Composition over one-offs**: new variants belong in the component's
  `cva` config (see `buttonVariants` in `button.tsx`), not scattered
  `className` overrides at call sites.
- **Touch targets**: interactive elements need a real hit area ≥44×44px.
  Use the existing size scale (`h-9`/`size-9` and up for anything tappable
  on touch); don't hand-roll a smaller custom control.
- **Contrast**: token pairs (`bg-*` + `*-foreground`) are already
  maintained as AA-compliant pairs — always use them together, never mix
  a background token with an unrelated foreground token or a raw color.
- **Motion**: any animation uses the `motion` skill, not ad-hoc
  `transition-*` values or one-off durations/easings.

## When you find an inconsistency

Don't silently work around it. Report it: which rule, which file/line,
and the token it should have used. If the same non-token value shows up
in 2+ places, that's a missing token — propose adding it to `globals.css`
rather than letting the duplication spread.
