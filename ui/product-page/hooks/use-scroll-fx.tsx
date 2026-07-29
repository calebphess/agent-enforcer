'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Reveals children when they scroll into view. Add the `reveal` (or
 * `reveal-left` / `reveal-right` / `reveal-scale`) class to any element inside
 * the returned ref and it will gain `is-visible` once on screen.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: {
  once?: boolean
  threshold?: number
  rootMargin?: string
}) {
  const { once = true, threshold = 0.15, rootMargin = '0px 0px -10% 0px' } = options ?? {}
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return

    const targets = new Set<Element>()
    if (
      root.classList.contains('reveal') ||
      root.classList.contains('reveal-left') ||
      root.classList.contains('reveal-right') ||
      root.classList.contains('reveal-scale')
    ) {
      targets.add(root)
    }
    root
      .querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale')
      .forEach((el) => targets.add(el))

    if (targets.size === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            if (once) observer.unobserve(entry.target)
          } else if (!once) {
            entry.target.classList.remove('is-visible')
          }
        })
      },
      { threshold, rootMargin },
    )

    targets.forEach((t) => observer.observe(t))
    return () => observer.disconnect()
  }, [once, threshold, rootMargin])

  return ref
}

/** Tracks page scroll progress 0..1 for parallax / progress bars. */
export function useScrollProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const doc = document.documentElement
        const max = doc.scrollHeight - doc.clientHeight
        setProgress(max > 0 ? doc.scrollTop / max : 0)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  return progress
}

/** Simple viewport-relative parallax offset in px for a referenced element. */
export function useParallax<T extends HTMLElement = HTMLDivElement>(speed = 0.15) {
  const ref = useRef<T | null>(null)
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const center = rect.top + rect.height / 2
        const delta = center - window.innerHeight / 2
        setOffset(-delta * speed)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [speed])

  return { ref, offset }
}
