'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useReveal } from '@/hooks/use-scroll-fx'

const COMPAT = ['Claude Code', 'Kiro', 'Cursor', 'GitHub Copilot']

export function CtaFooter() {
  const ref = useReveal<HTMLDivElement>()

  return (
    <div ref={ref}>
      {/* CTA */}
      <section id="contact" className="console-bg relative overflow-hidden border-t border-white/5 py-28">
        <div className="orbit-field pointer-events-none absolute inset-0 opacity-60" aria-hidden>
          <div className="orbit orbit-1">
            <span className="orbit-node" />
          </div>
          <div className="orbit orbit-2">
            <span className="orbit-node" />
          </div>
        </div>
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-[110px]"
          style={{ background: 'radial-gradient(circle, rgba(200,169,74,0.45), transparent 70%)' }}
          aria-hidden
        />

        <div className="reveal relative mx-auto flex max-w-3xl flex-col items-center px-4 text-center sm:px-6">
          <img
            src="/agent-enforcer-icon.png"
            alt="Agent Enforcer"
            className="animate-float mb-8 size-20 drop-shadow-[0_8px_30px_rgba(200,169,74,0.4)]"
          />
          <h2 className="text-balance text-4xl font-extrabold tracking-tight text-paper sm:text-5xl">
            Govern your AI before it&apos;s a{' '}
            <span className="text-gold-gradient">liability.</span>
          </h2>
          <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-blue">
            Auditors are already asking how you govern your AI. Agent Enforcer is your answer.
            Request a briefing with an enforcement specialist.
          </p>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/contact"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-md bg-gold px-8 text-sm font-bold text-navy transition-all hover:-translate-y-0.5 hover:bg-gold-light"
            >
              Request a Briefing
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            <a
              href="#pricing"
              className="inline-flex h-12 items-center justify-center rounded-md border border-white/15 bg-white/5 px-8 text-sm font-semibold text-paper transition-colors hover:border-gold/40 hover:bg-white/10"
            >
              View Pricing
            </a>
          </div>

          <div className="mt-12 flex flex-col items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-blue">
              Works with your existing tooling
            </span>
            <div className="flex flex-wrap justify-center gap-2">
              {COMPAT.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-white/12 bg-white/5 px-4 py-1.5 text-xs font-semibold text-paper/90"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-navy">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <img src="/agent-enforcer-icon.png" alt="Agent Enforcer" className="size-10" />
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-extrabold text-paper">Agent Enforcer</span>
                <span className="text-xs text-muted-blue">Stop the Slop.</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-blue">
              <span>Powered by</span>
              <img src="/alchemist-logo-white.png" alt="Alchemist" className="h-4 w-auto opacity-85" />
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-white/8 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-blue">
              © 2026 Alchemist. All rights reserved. Agent Enforcer is a trademark of Alchemist.
            </p>
            <p className="text-[11px] font-semibold tracking-wide text-muted-blue">
              Enterprise AI Policy Enforcement
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
