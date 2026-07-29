'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  Bot,
  Server,
  RotateCw,
  LogOut,
  Menu,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getToken, clearToken } from '@/lib/api'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  NavTransitionProvider,
  useNavTransition,
} from '@/components/scene-transition'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'

// ----------------------------------------------------------------------------
// Page chrome context — pages register their title + refresh handler.
// ----------------------------------------------------------------------------

interface ChromeContextValue {
  setTitle: (t: string) => void
  setRefreshHandler: (fn: (() => void | Promise<void>) | null) => void
}

const ChromeContext = createContext<ChromeContextValue | null>(null)

export function usePageChrome(
  title: string,
  onRefresh?: () => void | Promise<void>,
) {
  const ctx = useContext(ChromeContext)

  useEffect(() => {
    ctx?.setTitle(title)
  }, [ctx, title])

  useEffect(() => {
    ctx?.setRefreshHandler(onRefresh ?? null)
    return () => ctx?.setRefreshHandler(null)
  }, [ctx, onRefresh])
}

// ----------------------------------------------------------------------------
// Navigation
// ----------------------------------------------------------------------------

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/fleet', label: 'Fleet', icon: Server },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/assistants', label: 'Assistants', icon: Bot },
]

const FOOTER_TEXT =
  '© 2026 Alchemist. All rights reserved. Agent Enforcer is a trademark of Alchemist.'

/**
 * Nav item. Clicking plays the cinematic navy sweep (see NavTransitionProvider
 * + the scene-* rules in globals.css) before the route actually changes.
 * `onNavigate` lets the mobile drawer close itself on selection.
 */
function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: (typeof NAV)[number]
  active: boolean
  onNavigate?: () => void
}) {
  const navigate = useNavTransition()
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={(e) => {
        // Preserve modifier-click (open in new tab) behaviour.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        onNavigate?.()
        navigate(item.href, item.label)
      }}
      className={cn(
        'relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-navy-2 text-gold'
          : 'text-[#9AA6BB] hover:bg-navy-2/60 hover:text-paper',
      )}
      aria-current={active ? 'page' : undefined}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-gold" />
      )}
      <Icon className="size-[18px]" aria-hidden />
      {item.label}
    </Link>
  )
}

// ----------------------------------------------------------------------------
// App shell
// ----------------------------------------------------------------------------

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)
  const [title, setTitle] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const refreshRef = useRef<(() => void | Promise<void>) | null>(null)

  const setRefreshHandler = useCallback(
    (fn: (() => void | Promise<void>) | null) => {
      refreshRef.current = fn
    },
    [],
  )

  // Client-side auth guard.
  useEffect(() => {
    if (!getToken()) {
      router.replace('/login')
      return
    }
    setReady(true)
  }, [router])

  const handleRefresh = useCallback(async () => {
    if (!refreshRef.current || refreshing) return
    setRefreshing(true)
    try {
      await refreshRef.current()
    } finally {
      setRefreshing(false)
    }
  }, [refreshing])

  function handleLogout() {
    clearToken()
    router.replace('/login')
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <img
          src="/agent-enforcer-icon.png"
          alt=""
          aria-hidden
          className="size-10 animate-pulse"
        />
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  return (
    <NavTransitionProvider>
      <ChromeContext.Provider value={{ setTitle, setRefreshHandler }}>
        <div className="flex min-h-screen bg-background">
          {/* Sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-white/5 bg-navy md:flex">
          <div className="flex items-center gap-2.5 px-5 py-5">
            <img
              src="/agent-enforcer-icon.png"
              alt="Agent Enforcer"
              className="size-9 shrink-0"
            />
            <span className="text-sm font-extrabold text-paper">Agent Enforcer</span>
          </div>

          <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
            {NAV.map((item) => {
              const active =
                item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
              return <NavLink key={item.href} item={item} active={active} />
            })}
          </nav>

          <div className="border-t border-white/5 px-3 py-4">
            <div className="flex items-center gap-2.5 px-3 pb-2">
              <div className="flex size-8 items-center justify-center rounded-full bg-navy-2 text-xs font-bold text-gold">
                AD
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold text-paper">admin</span>
                <span className="text-[11px] text-[#647084]">Administrator</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-[#9AA6BB] transition-colors hover:bg-navy-2/60 hover:text-paper"
            >
              <LogOut className="size-[18px]" aria-hidden />
              Log out
            </button>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-h-screen flex-1 flex-col md:pl-60">
          {/* Topbar */}
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-background/90 px-6 backdrop-blur">
            <div className="flex items-center gap-2.5">
              {/* Mobile navigation drawer */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger
                  aria-label="Open navigation menu"
                  className="inline-flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-soft md:hidden"
                >
                  <Menu className="size-5" aria-hidden />
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-72 border-white/5 bg-navy p-0 text-paper"
                >
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <div className="flex h-full flex-col">
                    <div className="flex items-center gap-2.5 px-5 py-5">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy-2">
                        <img
                          src="/agent-enforcer-icon.png"
                          alt=""
                          className="size-7"
                        />
                      </span>
                      <span className="text-sm font-extrabold text-paper">
                        Agent Enforcer
                      </span>
                    </div>
                    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
                      {NAV.map((item) => {
                        const active =
                          item.href === '/'
                            ? pathname === '/'
                            : pathname.startsWith(item.href)
                        return (
                          <NavLink
                            key={item.href}
                            item={item}
                            active={active}
                            onNavigate={() => setMobileOpen(false)}
                          />
                        )
                      })}
                    </nav>
                    <div className="border-t border-white/5 px-3 py-4">
                      <button
                        type="button"
                        onClick={() => {
                          setMobileOpen(false)
                          handleLogout()
                        }}
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-[#9AA6BB] transition-colors hover:bg-navy-2/60 hover:text-paper"
                      >
                        <LogOut className="size-[18px]" aria-hidden />
                        Log out
                      </button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Mobile brand mark — navy square keeps the icon visible on any header */}
              <span className="flex size-8 items-center justify-center rounded-lg bg-navy md:hidden">
                <img
                  src="/agent-enforcer-icon.png"
                  alt="Agent Enforcer"
                  className="size-6"
                />
              </span>
              <h1 className="text-base font-extrabold tracking-tight text-foreground">{title}</h1>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-soft hover:text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-gold/40 disabled:opacity-60"
              >
                <RotateCw className={cn('size-4', refreshing && 'animate-spin')} aria-hidden />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1">
            <div className="mx-auto w-full max-w-[1200px] px-6 py-8">
              {children}
            </div>
          </main>

          {/* Footer */}
          <footer className="border-t border-line px-6 py-5">
            <p className="text-center text-xs text-muted-foreground">{FOOTER_TEXT}</p>
          </footer>
        </div>
        </div>
      </ChromeContext.Provider>
    </NavTransitionProvider>
  )
}
