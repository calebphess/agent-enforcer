'use client'

import Link from 'next/link'
import { FileUp, Cpu, RefreshCw, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react'
import { SectionHeading } from '@/components/section-heading'
import { useReveal } from '@/hooks/use-scroll-fx'

const STEPS = [
  {
    icon: FileUp,
    title: 'Define Policy',
    body: 'Your team authors enforcement documents in plain English. Security requirements, compliance controls, and coding standards.',
  },
  {
    icon: Cpu,
    title: 'Generate Configuration',
    body: 'A configuration engine converts policy docs into structured guidance for your coding agents: instructions, settings, skills, and commands.',
  },
  {
    icon: RefreshCw,
    title: 'Distribute Automatically',
    body: 'Agents on every developer machine sync enforcement config automatically. No developer action required.',
  },
  {
    icon: ShieldCheck,
    title: 'Enforce at Session Start',
    body: 'Every AI coding session starts with your policies already active. Compliant by default.',
  },
]

const PROFILE: [string, string][] = [
  ['Platform', 'Rocky Linux / RHEL 9 (RPM)'],
  ['Agent size', '< 1 MB installed'],
  ['Network', 'Outbound HTTPS only'],
  ['Air-gap compatible', 'Yes, configurable endpoint'],
  ['Sync interval', 'Configurable per fleet'],
  ['User action required', 'None after install'],
  ['Credentials', 'IAM role, no user secrets'],
  ['Audit trail', 'Sync logs + version history'],
]

export function HowItWorks() {
  const ref = useReveal<HTMLDivElement>()

  return (
    <section ref={ref} className="console-bg relative border-t border-white/5 py-24 sm:py-32">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="How It Works"
          title="From policy to enforcement in four steps"
          description="Defined once by your team, then enforced everywhere, continuously and automatically."
        />

        <ol className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => {
            const Icon = step.icon
            return (
              <li
                key={step.title}
                className="reveal card-hover relative overflow-hidden rounded-xl border border-white/10 bg-card/70 p-6"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <span className="absolute right-4 top-3 font-mono text-4xl font-extrabold text-white/5">
                  {i + 1}
                </span>
                <div className="mb-5 inline-flex size-12 items-center justify-center rounded-xl border border-gold/30 bg-gold-tint text-gold">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3 className="text-base font-extrabold text-paper">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-blue">{step.body}</p>
              </li>
            )
          })}
        </ol>

        {/* Deployment profile */}
        <div className="reveal-scale mt-16 overflow-hidden rounded-2xl border border-white/10 bg-card/60">
          <div className="border-b border-white/8 px-6 py-4">
            <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-gold">
              Deployment Profile
            </h3>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {PROFILE.map(([k, v], i) => (
              <div
                key={k}
                className={`flex flex-col gap-1 px-6 py-4 ${
                  i % 4 !== 3 ? 'lg:border-r lg:border-white/6' : ''
                } border-b border-white/6`}
              >
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-blue">
                  {k}
                </dt>
                <dd className="text-sm font-semibold text-paper">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Supported operating systems */}
        <div className="reveal-scale mt-6 overflow-hidden rounded-2xl border border-white/10 bg-card/60">
          <div className="border-b border-white/8 px-6 py-4">
            <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-gold">
              Supported Operating Systems
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-px bg-white/6 sm:grid-cols-3">
            <OsTile name="Linux" src="/os/linux.svg" available />
            <OsTile name="macOS" src="/os/apple.svg" available />
            <OsTile name="Windows" src="/os/windows.svg" />
          </div>
        </div>

        {/* White-glove policy service */}
        <div className="reveal mt-6 flex flex-col gap-5 rounded-2xl border border-gold/25 bg-gold-tint p-8 sm:flex-row sm:items-center">
          <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl border border-gold/40 bg-navy/40 text-gold">
            <Sparkles className="size-6" aria-hidden />
          </span>
          <div className="flex-1">
            <h3 className="text-lg font-extrabold text-paper">
              Prefer to hand it off? White-glove policy service
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-blue">
              No bandwidth to author and maintain policy in-house? Our enforcement specialists
              will define, upload, and continuously maintain your enforcement posture for you, so
              your standards stay current as your stack and compliance requirements evolve.
            </p>
          </div>
          <Link
            href="/contact"
            className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-gold px-6 text-sm font-bold text-navy transition-all hover:-translate-y-0.5 hover:bg-gold-light"
          >
            Talk to a Specialist
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  )
}

function OsTile({ name, src, available }: { name: string; src: string; available?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 bg-card/60 px-6 py-8">
      <span
        className={`size-12 ${available ? 'bg-gold' : 'bg-muted-blue/50'}`}
        style={{
          maskImage: `url(${src})`,
          WebkitMaskImage: `url(${src})`,
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
        }}
        aria-hidden
      />
      <span className={`text-sm font-bold ${available ? 'text-paper' : 'text-muted-blue'}`}>
        {name}
      </span>
      {available ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold-tint px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">
          <span className="size-1.5 rounded-full bg-gold" aria-hidden /> Available
        </span>
      ) : (
        <span className="rounded-full border border-white/12 bg-white/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-blue">
          Coming soon
        </span>
      )}
    </div>
  )
}
