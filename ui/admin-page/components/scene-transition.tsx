'use client'

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

// Timeline (ms). The panel covers the content BEFORE we swap routes, so the
// incoming page renders hidden behind the navy panel and is revealed on the
// way out — the transition genuinely runs before the page change is visible.
const PUSH_AT = 580 // navigate once the panel fully covers the content
const REVEAL_AT = 1000 // begin sweeping the panel back out
const DONE_AT = 1560 // tear down the overlay

type Phase = 'cover' | 'reveal'

type NavigateFn = (href: string, label: string) => void

const NavTransitionContext = createContext<NavigateFn | null>(null)

export function useNavTransition(): NavigateFn {
  const ctx = useContext(NavTransitionContext)
  if (!ctx) {
    throw new Error('useNavTransition must be used within NavTransitionProvider')
  }
  return ctx
}

export function NavTransitionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [scene, setScene] = useState<{
    label: string
    phase: Phase
    key: number
  } | null>(null)
  const running = useRef(false)

  const navigate = useCallback<NavigateFn>(
    (href, label) => {
      if (running.current) return
      running.current = true
      setScene({ label, phase: 'cover', key: Date.now() })

      window.setTimeout(() => router.push(href), PUSH_AT)
      window.setTimeout(() => {
        setScene((s) => (s ? { ...s, phase: 'reveal' } : s))
      }, REVEAL_AT)
      window.setTimeout(() => {
        setScene(null)
        running.current = false
      }, DONE_AT)
    },
    [router],
  )

  return (
    <NavTransitionContext.Provider value={navigate}>
      {children}
      {scene && (
        <div
          key={scene.key}
          className={cn(
            'scene-overlay',
            scene.phase === 'cover' ? 'phase-cover' : 'phase-reveal',
          )}
          aria-hidden
        >
          <div className="scene-sweep scene-sweep-gold" />
          <div className="scene-sweep scene-sweep-navy" />
          <div className="scene-title">
            <img src="/agent-enforcer-icon.png" alt="" />
            <span>
              <span className="scene-title-eyebrow">Agent Enforcer</span>
              <span className="scene-title-label">{scene.label}</span>
            </span>
          </div>
        </div>
      )}
    </NavTransitionContext.Provider>
  )
}
