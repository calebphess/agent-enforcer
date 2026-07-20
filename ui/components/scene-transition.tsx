'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

// Timeline (ms). The panel covers the content BEFORE we swap routes, so the
// incoming page renders hidden behind the navy panel and is revealed on the
// way out — the transition genuinely runs before the page change is visible.
const PUSH_AT = 580 // navigate once the panel fully covers the content
const REVEAL_AT = 1000 // begin sweeping the panel back out
const DONE_AT = 1560 // tear down the overlay

type Phase = 'idle' | 'cover' | 'reveal'

const NavTransitionContext = createContext<(href: string, label: string) => void>(() => {})

export function useNavTransition() {
  return useContext(NavTransitionContext)
}

/**
 * Drives a bold left-to-right scene wipe on navigation. On each transition the
 * navy panel first sweeps in to fully cover the content region, THEN the route
 * changes (hidden behind the panel), THEN the panel sweeps out to reveal the
 * new page — with the brand title floating up once the panel is in place.
 */
export function NavTransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [phase, setPhase] = useState<Phase>('idle')
  const [label, setLabel] = useState('')
  const busy = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  useEffect(() => () => clearTimers(), [clearTimers])

  const navigate = useCallback(
    (href: string, lbl: string) => {
      if (busy.current || href === pathname) return
      busy.current = true
      setLabel(lbl)
      setPhase('cover')
      timers.current.push(setTimeout(() => router.push(href), PUSH_AT))
      timers.current.push(setTimeout(() => setPhase('reveal'), REVEAL_AT))
      timers.current.push(
        setTimeout(() => {
          setPhase('idle')
          busy.current = false
        }, DONE_AT),
      )
    },
    [pathname, router],
  )

  return (
    <NavTransitionContext.Provider value={navigate}>
      {children}
      {phase !== 'idle' && (
        <div
          className={cn('scene-overlay', phase === 'cover' ? 'phase-cover' : 'phase-reveal')}
          aria-hidden
        >
          <div className="scene-sweep scene-sweep-gold" />
          <div className="scene-sweep scene-sweep-navy" />
          <div className="scene-title">
            <img src="/agent-enforcer-icon.png" alt="" />
            <div className="flex flex-col gap-1.5">
              <span className="scene-title-eyebrow">Agent Enforcer</span>
              <span className="scene-title-label text-balance">{label}</span>
            </div>
          </div>
        </div>
      )}
    </NavTransitionContext.Provider>
  )
}
