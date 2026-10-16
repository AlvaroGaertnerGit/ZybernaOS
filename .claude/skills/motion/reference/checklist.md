# Motion review checklist

Use this when auditing a diff or file for animation issues — report each hit
as `file:line`, what's wrong, and the fix, same format as `/code-review`.

## Consistency

- [ ] **Hardcoded duration.** Grep for `duration: 0\.` or `duration:\s*\d` —
  any literal number should instead be `duration.fast`/`base`/`slow`/`slower`
  from `src/lib/motion.ts`.
- [ ] **Hardcoded easing.** Grep for `ease: [` or `ease: "` — should be
  `easing.out`/`easing.inOut`/`easing.spring`. `"linear"` is always wrong.
- [ ] **Duplicated variant objects.** The same `{ opacity: 0, y: ... }` shape
  written in two or more files → should be a shared variant in
  `src/lib/motion-variants.ts`.
- [ ] **Inconsistent offsets for the same kind of element.** e.g. one card
  entrance uses `y: 12` and a sibling card uses `y: 40` — same UI pattern
  should use the same distance token.

## Distraction / subtlety

- [ ] **Translate distance > 24px (`distance.lg`)** on an entrance — reads as
  a slide/slideshow, not a reveal.
- [ ] **Duration > 0.6s (`duration.slower`)** on anything that isn't a
  full-page hero entrance.
- [ ] **Animating more than ~3 properties at once** on a single element
  (opacity + y + scale + rotate + blur, etc.) — compounding motion reads as
  busy. Two, rarely three, is the ceiling.
- [ ] **Looping/infinite animations** (`repeat: Infinity`) outside of loading
  spinners or deliberate ambient background effects — these are the highest-
  risk pattern for "distracting" and need explicit justification.
- [ ] **`whileInView` without `viewport={{ once: true }}`** — entrance
  replays every time the element scrolls in/out of view. Almost always a bug.

## Performance / correctness

- [ ] **Animating layout-triggering properties** — `width`, `height`, `top`,
  `left`, `margin`, `box-shadow` directly in `animate`/`whileHover`/etc.
  Should be `scale`/`x`/`y`/opacity-based instead (or `layout` prop for
  actual layout changes).
- [ ] **`AnimatePresence` children missing a stable `key`.** Without it, exit
  animations won't fire correctly on unmount.
- [ ] **Stagger with more than ~8 visible items** or `staggerChildren` above
  ~0.08s — reads as lag on longer lists, not polish.

## Accessibility

- [ ] **No reduced-motion path.** Any component using `useScroll`,
  `useTransform`, `setInterval`/`requestAnimationFrame`-driven motion, or a
  CSS animation outside `motion.*` must branch on `useReducedMotion()`. See
  `reference/accessibility.md`.
- [ ] **`MotionProvider` not mounted**, or a second/duplicate `MotionConfig`
  with different settings introduced elsewhere in the tree — there should be
  exactly one, in `src/app/layout.tsx`.

## Structure

- [ ] **Inline animation object that's clearly reused** (same shape in 2+
  places) instead of a named variant.
- [ ] **New one-off variant that duplicates an existing one** in
  `src/lib/motion-variants.ts` under a different name — should just import
  the existing one.
