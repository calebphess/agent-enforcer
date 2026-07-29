'use client'

import { Unlock, AlertTriangle, FileWarning, Receipt, EyeOff } from 'lucide-react'
import { SectionHeading } from '@/components/section-heading'
import { useReveal } from '@/hooks/use-scroll-fx'

const RISKS = [
  {
    icon: Unlock,
    title: 'No guardrails at session start',
    body: 'Every AI session begins with a blank slate. No policies. No security context. No standards.',
  },
  {
    icon: AlertTriangle,
    title: 'Inconsistent, non-compliant output',
    body: 'Developers prompt AI differently, producing wildly divergent and non-compliant code.',
  },
  {
    icon: FileWarning,
    title: 'Vulnerabilities ship silently',
    body: 'Security flaws get written and shipped before any human ever reviews them.',
  },
  {
    icon: EyeOff,
    title: 'Thin audit trails',
    body: 'Accountability is unclear. Auditors ask how you govern AI, and there is no answer.',
  },
  {
    icon: Receipt,
    title: 'Token costs balloon',
    body: 'Unguided agents loop through trial and error, burning budget on wasted iterations.',
  },
]

export function Problem() {
  const ref = useReveal<HTMLDivElement>()

  return (
    <section id="problem" ref={ref} className="relative border-t border-white/5 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="The Problem"
          title="Ungoverned AI is already writing your code"
          description="Organizations are deploying AI coding assistants at scale. These models have no inherent knowledge of your security controls, compliance requirements, or internal standards."
        />

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RISKS.map((risk, i) => {
            const Icon = risk.icon
            return (
              <div
                key={risk.title}
                className="reveal card-hover group relative overflow-hidden rounded-xl border border-white/10 bg-card/60 p-6"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="mb-4 inline-flex size-11 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 text-danger">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3 className="text-base font-bold text-paper">{risk.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-blue">{risk.body}</p>
              </div>
            )
          })}

          {/* Callout tile completing the grid */}
          <div className="reveal group relative flex flex-col justify-center overflow-hidden rounded-xl border border-gold/25 bg-gold-tint p-6 transition-all duration-500 hover:-translate-y-1 hover:border-gold/60 hover:shadow-[0_16px_50px_-12px_rgba(200,169,74,0.45)]">
            {/* Drifting console grid */}
            <div
              className="grid-lines pointer-events-none absolute inset-0 opacity-40 transition-transform duration-700 ease-out group-hover:translate-x-3 group-hover:translate-y-3 group-hover:opacity-70"
              aria-hidden
            />
            {/* Gold glow bloom on hover */}
            <div
              className="pointer-events-none absolute -inset-8 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
              style={{ background: 'radial-gradient(circle at 30% 40%, rgba(200,169,74,0.35), transparent 65%)' }}
              aria-hidden
            />
            <p className="relative text-lg font-extrabold leading-snug text-paper">
              Without enforcement, every risk above compounds{' '}
              <span className="text-gold transition-[text-shadow] duration-500 group-hover:[text-shadow:0_0_18px_rgba(200,169,74,0.7)]">
                across every developer, every day.
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
