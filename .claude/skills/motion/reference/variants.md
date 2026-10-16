# Variant catalog

Defined in `src/lib/motion-variants.ts` (copy from `templates/variants.ts` if
missing). Reach for one of these before writing a new variant — a new one is
only justified if none of these fit the motion you actually need.

## `fadeIn`

Opacity only, no movement. Use for content that shouldn't visually "arrive"
from a direction — background layers, overlays, things behind other content.

```tsx
<motion.div variants={fadeIn} initial="hidden" animate="visible" />
```

## `fadeInUp` / `fadeInDown`

The default entrance for cards, sections, and list rows. Fades in while
translating `distance.md` (12px) from below/above. This is the variant to
reach for by default — if you're not sure which one to use, use `fadeInUp`.

```tsx
<motion.section
  variants={fadeInUp}
  initial="hidden"
  whileInView="visible"
  viewport={{ once: true }}
/>
```

## `scaleIn`

Opacity + scale from 0.96 → 1. Use for things that "pop in" — modals,
popovers, dropdown menus, tooltips. Do not use for large page sections; the
scale reads as a UI-chrome pattern, not a content-reveal pattern.

## `staggerContainer` + `staggerItem`

For lists/grids where children should reveal in sequence rather than all at
once. Put `staggerContainer` on the parent, `staggerItem` on each child.

```tsx
<motion.ul variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }}>
  {items.map((item) => (
    <motion.li key={item.id} variants={staggerItem}>{item.label}</motion.li>
  ))}
</motion.ul>
```

`staggerItem` is `fadeInUp` under the hood — a stagger is just `fadeInUp`
applied to each child with `staggerChildren` delay on the parent, not a
different motion language.

## When none of these fit

Write a colocated `const variants: Variants = {...}` in the component file,
built from `duration`/`easing`/`distance` tokens — never raw numbers. If the
pattern turns out to be needed in a second place, promote it into
`src/lib/motion-variants.ts` instead of copy-pasting.

## Page / route transitions

This project doesn't have a page-transition wrapper yet. If one becomes
necessary, it belongs in a client component wrapping `{children}` in
`AnimatePresence mode="wait"`, keyed on `usePathname()`, using `fadeIn` (not
a slide — page-level slides are almost always more distracting than they're
worth). Don't add this speculatively; add it when a route transition is
actually requested.
