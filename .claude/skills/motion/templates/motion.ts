export const duration = {
  instant: 0.1,
  fast: 0.15,
  base: 0.25,
  slow: 0.4,
  slower: 0.6,
} as const

export const easing = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.4, 0, 0.2, 1],
  spring: { type: "spring", stiffness: 420, damping: 32 },
} as const

export const distance = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 24,
} as const
