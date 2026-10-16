# Reduced motion

Accessibility is mandatory in this project (see root `CLAUDE.md`) — motion is
not exempt. Nobody should have to opt out of using the site because of an
animation.

## The baseline: `MotionConfig`

Mount `MotionProvider` (see `templates/motion-provider.tsx`) once in
`src/app/layout.tsx`, wrapping `{children}`:

```tsx
import { MotionProvider } from "@/components/motion-provider"

<MotionProvider>{children}</MotionProvider>
```

It wraps the app in `<MotionConfig reducedMotion="user">`. This is the whole
mechanism for 95% of animations: when the OS/browser reports
`prefers-reduced-motion: reduce`, Framer Motion automatically converts every
`x`/`y`/`scale`/`rotate` transform in every `motion.*` component to an
instant, effectively-non-animated state, while still letting `opacity`
transitions run (so content doesn't just pop with zero transition at all).
You do not need to write per-component checks for this to work.

## When you need the second layer: `useReducedMotion()`

`MotionConfig` only touches Framer Motion's own animation props. It cannot
help with things you drive yourself in JS/CSS:

- Scroll-linked effects (`useScroll`, `useTransform` parallax)
- `setInterval`/`requestAnimationFrame`-driven animation loops
- CSS animations/transitions applied outside `motion.*` components
- Autoplaying carousels/marquees

For these, import the hook and branch explicitly:

```tsx
import { useReducedMotion } from "framer-motion"

const shouldReduceMotion = useReducedMotion()

const y = shouldReduceMotion ? 0 : scrollDrivenY
```

Never build a parallax, autoplaying carousel, or scroll-jacking effect
without this check — these are exactly the patterns most likely to trigger
vestibular discomfort for users who've set the preference.

## What NOT to do

- Don't wrap individual components in their own `useReducedMotion()` checks
  for ordinary `motion.div` enter/exit animations — `MotionProvider` already
  covers it. Duplicating the check per component is the kind of drift this
  skill exists to prevent.
- Don't disable reduced motion for "important" animations. If it's driven by
  `motion.*` props, it defers to the user's preference, full stop.

## How to test it

Chrome DevTools → Command palette (`Ctrl+Shift+P`) → "Emulate CSS
prefers-reduced-motion" → `reduce`. Reload and confirm entrances no longer
translate/scale (opacity fades are still fine) and any parallax/marquee
freezes to a static state.
