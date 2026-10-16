"use client"

import { MotionConfig } from "framer-motion"
import type { ReactNode } from "react"

import { duration, easing } from "@/lib/motion"

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: duration.base, ease: easing.out }}
    >
      {children}
    </MotionConfig>
  )
}
