'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

export interface ResponsiveColumn {
  /** Column id / accessorKey to toggle. */
  key: string
  /** Approximate width (px) this column needs, including cell padding. */
  minWidth: number
}

/**
 * Progressively hides table columns based on the ACTUAL width available to the
 * grid rather than the viewport, so nothing ever hangs off-screen or triggers a
 * horizontal scroll. Attach the returned `containerRef` to the element that
 * wraps the table; as it gets thinner, columns are dropped from the end of the
 * `columns` priority list first (the primary column is always kept).
 *
 * @param primaryMinWidth Width reserved for the always-visible primary column.
 * @param columns         Optional columns ordered highest → lowest priority
 *                        (last entry drops first as space shrinks).
 * @param alwaysHidden    Columns that stay hidden regardless of width.
 */
export function useResponsiveColumns(
  primaryMinWidth: number,
  columns: ResponsiveColumn[],
  alwaysHidden: Record<string, boolean> = {},
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(null)

  useIsomorphicLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const columnVisibility = useMemo<Record<string, boolean>>(() => {
    const visibility: Record<string, boolean> = { ...alwaysHidden }
    let used = primaryMinWidth
    for (const col of columns) {
      // Before the first measurement, default to showing everything so desktop
      // renders complete on first paint (mobile corrects within a frame).
      if (width == null) {
        visibility[col.key] = true
        continue
      }
      used += col.minWidth
      visibility[col.key] = used <= width
    }
    return visibility
  }, [width, primaryMinWidth, columns, alwaysHidden])

  return { containerRef, columnVisibility }
}
