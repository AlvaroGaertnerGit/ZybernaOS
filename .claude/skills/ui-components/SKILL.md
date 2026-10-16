---
name: ui-components
description: Create or extend reusable UI components in src/components/. Use whenever asked to build a new component, add a UI element (modal, dropdown, card, badge, form field, ...), refactor duplicated UI into something shared, or decide between shadcn/ui and a custom component.
---

Styling rules (tokens, spacing, radius, contrast) live in the
`design-system` skill — this skill is about component *structure*: what
to reuse, what shape a new component takes, and how to keep it accessible.
Don't duplicate those rules here; load that skill too when you're about
to write className values.

## 1. Check before building

Never hand-roll a component that already exists locally or upstream:

```bash
node .claude/skills/ui-components/scripts/find-component.mjs "<what you need>"
```

This reports, in order:
1. **Already in this project** (`src/components/**`) — use/extend it.
2. **In the shadcn registry, not installed** — install it, don't rebuild it:
   ```bash
   npx shadcn add <name>          # e.g. npx shadcn add dialog
   ```
   Preview first with `npx shadcn add <name> --dry-run`, or read the
   source before installing with `npx shadcn view <name>`.
3. **No match anywhere** — build custom, starting from a template (§3).

If a shadcn component almost fits, install it and customize via its
`className`/variant props — don't fork the source to tweak one thing.

## 2. Interactive = accessible for free — don't hand-build it

This project's shadcn style (`base-nova`) wraps `@base-ui/react`
primitives (see the `ButtonPrimitive` import in
`src/components/ui/button.tsx`). Focus management, keyboard nav,
`aria-*` state, and portal/dismiss behavior for anything interactive
(dialog, dropdown, popover, tooltip, tabs, accordion, ...) come from
that primitive layer already. **Never reimplement that logic by hand** —
install the matching shadcn/`@base-ui` component (§1) instead of writing
raw `onClick`/`onKeyDown`/focus-trap code for something that already has
an accessible primitive upstream.

For genuinely custom interactive behavior with no upstream primitive:
still build it on a semantic native element (`<button>`, not `<div
onClick>`), and it must satisfy every item in the checklist below before
it ships.

## 3. Building custom (no match found)

Start from a template, don't start from a blank file:

- `templates/simple-component.tsx.template` — presentational, one look,
  no variants (modeled on `card.tsx`'s compound-parts pattern).
- `templates/variant-component.tsx.template` — has `variant`/`size`
  props via `cva` (modeled on `button.tsx`).

Both encode the conventions already in this codebase — match them
instead of inventing a new shape:

- Named function + named export (`export { ComponentName }`), no
  `default export`.
- `data-slot="component-name"` on the root element (used for `has-`/`in-`
  Tailwind selectors and testing hooks).
- `className` is the **first** destructured prop, merged **last** via
  `cn(...)` so callers can always override.
- Props type is `React.ComponentProps<"tag">` (or the wrapped
  primitive's own `.Props`) — extend the native/primitive element, don't
  invent a parallel prop API for things HTML already gives you (`id`,
  `onClick`, `disabled`, ...).
- `{...props}` spreads last, after every explicit attribute.

## 4. Composition over inheritance, one API surface

- A component that needs to render different structures for different
  cases takes **children/slots**, not a `type` prop that branches
  internally into unrelated markup. Look at `Card`/`CardHeader`/
  `CardContent`/`CardFooter` in `card.tsx` (`npx shadcn view card`) — a
  compound-component split, not one `<Card variant="with-footer">`.
- A component that needs different *looks* takes `variant`/`size` props
  via `cva` (§3) — that's the one legitimate place branching logic
  belongs.
- Keep the prop surface minimal: if you're about to add a 4th boolean
  flag, that's a sign the component should split into two, or the
  variation belongs in `cva` variants instead.
- If you're about to copy an existing component's JSX and tweak a few
  classes at the call site, stop — extend the original via `className`/
  variant props instead. Two near-identical components is the
  duplication this skill exists to prevent.

## 5. Accessibility checklist (before shipping any new component)

- Interactive elements are real `<button>`/`<a>`/native form controls —
  never a styled `<div>` with a click handler.
- Every focusable element has a visible `focus-visible:` state (the
  `design-system` audit catches `outline-none` with none).
- Icon-only controls have an accessible name (`aria-label`, not just a
  `title`).
- Images/icons that are purely decorative are `aria-hidden` or use
  `alt=""`; meaningful ones have real `alt` text.
- Color is never the only signal (pair with text/icon/shape).
- Touch targets ≥44×44px — see the `design-system` skill's size-scale
  guidance.
- If it's a compound/interactive pattern with no upstream primitive,
  verify keyboard-only operation actually works before calling it done.

## 6. Where components go

- `src/components/ui/` — shadcn-managed primitives (installed via
  `npx shadcn add`, or hand-authored ones following this skill). Treat
  files here as library code: generic, no feature-specific logic.
- `src/components/<feature>/` — components specific to one feature/page.
  If a component under a feature folder starts being imported from a
  second feature, that's the signal to promote it to `src/components/ui/`
  or a shared `src/components/` location — don't import across feature
  folders.
