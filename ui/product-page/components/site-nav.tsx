'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { useScrollProgress } from '@/hooks/use-scroll-fx'

const LINKS = [
  { href: '#problem', label: 'Problem' },
  { href: '#solution', label: 'Solution' },
  { href: '#value', label: 'Value' },
  { href: '#proposal', label: 'Proposal' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#downloads', label: 'Downloads' },
]

export function SiteNav() {
  const progress = useScrollProgress()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Lock body scroll and close on Escape while the drawer is open.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? 'border-b border-white/10 bg-navy/85 backdrop-blur-md' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="#top" className="flex min-w-0 items-center gap-2.5">
          <img
            src="/agent-enforcer-icon.png"
            alt="Agent Enforcer"
            className="size-8 shrink-0 drop-shadow-[0_2px_10px_rgba(200,169,74,0.35)]"
          />
          <span className="flex min-w-0 flex-col leading-none">
            <span className="text-base font-extrabold tracking-tight text-paper">
              Agent Enforcer
            </span>
          </span>
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-blue transition-colors hover:text-paper"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/contact"
            className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-gold px-3 text-xs font-bold text-navy transition-all hover:-translate-y-px hover:bg-gold-light sm:px-4 sm:text-sm"
          >
            <span className="sm:hidden">Briefing</span>
            <span className="hidden sm:inline">Request Briefing</span>
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-white/10 text-paper transition-colors hover:bg-white/5 md:hidden"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            <Menu className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      {/* Scroll progress bar */}
      <div className="h-0.5 w-full bg-white/5">
        <div
          className="h-full bg-gradient-to-r from-gold-dark via-gold to-gold-light"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 md:hidden ${menuOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!menuOpen}
      >
        {/* Backdrop */}
        <button
          type="button"
          tabIndex={menuOpen ? 0 : -1}
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className={`absolute inset-0 bg-navy/70 backdrop-blur-sm transition-opacity duration-300 ${
            menuOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Panel */}
        <div
          id="mobile-menu"
          className={`absolute right-0 top-0 flex h-full w-72 max-w-[80%] flex-col border-l border-white/10 bg-card shadow-2xl transition-transform duration-300 ease-out ${
            menuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
            <span className="flex items-center gap-2.5">
              <img src="/agent-enforcer-icon.png" alt="" className="size-7" />
              <span className="text-sm font-extrabold tracking-tight text-paper">
                Agent Enforcer
              </span>
            </span>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="inline-flex size-9 items-center justify-center rounded-md border border-white/10 text-paper transition-colors hover:bg-white/5"
              aria-label="Close menu"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <nav className="flex flex-col gap-1 p-4">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-3 text-base font-semibold text-muted-blue transition-colors hover:bg-white/5 hover:text-paper"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="mt-auto border-t border-white/10 p-4">
            <Link
              href="/contact"
              onClick={() => setMenuOpen(false)}
              className="flex h-11 items-center justify-center rounded-md bg-gold text-sm font-bold text-navy transition-all hover:bg-gold-light"
            >
              Request Briefing
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
