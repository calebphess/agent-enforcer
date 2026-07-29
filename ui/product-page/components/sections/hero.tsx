'use client'

import Link from 'next/link'
import { ShieldCheck, ArrowRight } from 'lucide-react'
import { useParallax } from '@/hooks/use-scroll-fx'

export function Hero() {
  const { ref, offset } = useParallax(0.12)

  return (
    <section id="top" className="console-bg relative overflow-hidden pt-16">
      {/* Orbital field */}
      <div className="orbit-field pointer-events-none absolute inset-0 opacity-90" aria-hidden>
        <div className="orbit orbit-1">
          <span className="orbit-node" />
        </div>
        <div className="orbit orbit-2">
          <span className="orbit-node" />
        </div>
        <div className="orbit orbit-3">
          <span className="orbit-node" />
        </div>
      </div>

      {/* Gold glow bloom */}
      <div
        className="pointer-events-none absolute left-1/2 top-[42%] size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-[120px]"
        style={{ background: 'radial-gradient(circle, rgba(200,169,74,0.5), transparent 70%)' }}
        aria-hidden
      />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl flex-col items-center justify-center px-4 py-24 text-center sm:px-6">
        <div
          ref={ref}
          style={{ transform: `translateY(${offset}px)` }}
          className="animate-float mb-8"
        >
          <img
            src="/agent-enforcer-icon.png"
            alt="Agent Enforcer shield"
            className="size-28 drop-shadow-[0_10px_40px_rgba(200,169,74,0.4)] sm:size-32"
          />
        </div>

        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold-tint px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
          <ShieldCheck className="size-3.5" aria-hidden />
          Enterprise AI Policy Enforcement
        </span>

        <h1 className="text-balance text-5xl font-extrabold leading-[0.95] tracking-tight text-paper sm:text-7xl">
          Stop the <span className="text-gold-gradient">Slop.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-blue sm:text-xl">
          Enforce what your AI agents are allowed to do before they do it.{' '}
          <span className="text-paper">Agent Enforcer</span> locks your security policies, compliance
          controls, and coding standards into every AI session, automatically, at the system level.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/contact"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-md bg-gold px-7 text-sm font-bold text-navy transition-all hover:-translate-y-0.5 hover:bg-gold-light"
          >
            Request a Briefing
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
          <a
            href="#value"
            className="inline-flex h-12 items-center justify-center rounded-md border border-white/15 bg-white/5 px-7 text-sm font-semibold text-paper transition-colors hover:border-gold/40 hover:bg-white/10"
          >
            See How It Works
          </a>
        </div>

        <p className="mt-14 max-w-md text-balance text-sm italic leading-relaxed text-muted-blue/80">
          &ldquo;When your organization deploys AI coding assistants, who&apos;s making sure they
          follow your rules?&rdquo;
        </p>

        <div className="mt-8 flex items-center gap-2.5">
          <span className="h-px w-8 bg-white/15" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-blue/70">
            Powered by <span className="text-gold">Alchemist</span>
          </span>
          <span className="h-px w-8 bg-white/15" aria-hidden />
        </div>
      </div>

      {/* Bottom fade into next section */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background"
        aria-hidden
      />
    </section>
  )
}
