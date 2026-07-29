'use client'

import { useEffect, useState } from 'react'

/**
 * Tracks whether the viewport is below a breakpoint (default 768px, matching
 * Tailwind's `md`). Returns `false` on the server and during the first paint,
 * then updates on mount so SSR markup stays stable.
 */
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const update = () => setIsMobile(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [breakpoint])

  return isMobile
}

/**
 * Tracks whether the viewport is below the "narrow phone" breakpoint (default
 * 500px). Used to collapse data grids down to a single column before any
 * horizontal scroll would appear. Same SSR-safe behaviour as `useIsMobile`.
 */
export function useIsNarrow(breakpoint = 500) {
  return useIsMobile(breakpoint)
}
