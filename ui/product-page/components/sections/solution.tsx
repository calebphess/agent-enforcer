'use client'

import { Cloud, Cpu, MonitorCheck, Check, FileCheck2 } from 'lucide-react'
import { SectionHeading } from '@/components/section-heading'
import { useReveal } from '@/hooks/use-scroll-fx'

const STAGES = [
  {
    icon: Cloud,
    label: 'Policy Source',
    title: 'Enforcement Management UI',
    body: 'NIST controls, coding standards, and security policies are uploaded as plain-English documents.',
  },
  {
    icon: Cpu,
    label: 'Distribution Engine',
    title: 'Configuration Engine',
    body: 'Converts policy docs into structured guidance for your coding agents: instructions, settings, skills, and commands.',
  },
  {
    icon: MonitorCheck,
    label: 'Enforcement Layer',
    title: 'Every Developer. Every Session.',
    body: 'Agent Enforcer runs on every workstation, active before a single line of code is written.',
  },
]

const GUARANTEES = [
  'Security requirements baked in before code is written',
  'Compliance controls active on every AI session',
  'Coding standards applied uniformly across all developers',
  'No developer action required. System-level enforcement',
  'Policy updates propagate to every endpoint automatically',
  'Works with existing coding agent deployments. No rearchitecting',
]

export function Solution() {
  const ref = useReveal<HTMLDivElement>()

  return (
    <section id="solution" ref={ref} className="relative border-t border-white/5 py-24 sm:py-32">
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-30" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="The Solution"
          title="System-level enforcement. Zero developer friction."
          description="Agent Enforcer installs as a lightweight system service on developer workstations and CI/CD environments. It pulls your approved policy and applies it to every AI session, automatically."
        />

        {/* Architecture flow diagram */}
        <div className="reveal-scale mt-16 rounded-2xl border border-white/10 bg-card/70 p-6 shadow-float sm:p-10">
          <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
            {STAGES.map((stage, i) => {
              const Icon = stage.icon
              return (
                <div key={stage.label} className="contents">
                  <div className="group relative flex flex-col items-center rounded-xl border border-white/10 bg-navy/60 p-6 text-center transition-colors hover:border-gold/40">
                    <div className="relative mb-4 inline-flex size-14 items-center justify-center rounded-xl border border-gold/30 bg-gold-tint text-gold">
                      <Icon className="size-6" aria-hidden />
                      <span className="animate-pulse-node absolute -right-1 -top-1 size-2.5 rounded-full bg-gold" />
                    </div>
                    <span className="eyebrow mb-1">{stage.label}</span>
                    <h3 className="text-base font-extrabold text-paper">{stage.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-blue">{stage.body}</p>
                  </div>

                  {/* Animated connector (between stages only) */}
                  {i < STAGES.length - 1 && (
                    <div className="flex items-center justify-center py-2 lg:py-0">
                      <svg
                        className="h-8 w-full rotate-90 lg:h-8 lg:w-14 lg:rotate-0"
                        viewBox="0 0 56 20"
                        fill="none"
                        aria-hidden
                      >
                        <line
                          x1="2"
                          y1="10"
                          x2="46"
                          y2="10"
                          stroke="var(--gold)"
                          strokeWidth="2"
                          className="animate-flow"
                        />
                        <path d="M44 5 L54 10 L44 15 Z" fill="var(--gold)" />
                      </svg>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-6 text-center text-xs font-bold uppercase tracking-[0.16em] text-gold">
            Automatic · Continuous · Sync
          </p>
        </div>

        <PropagationVisual />

        <ul className="reveal mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
          {GUARANTEES.map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 rounded-lg border border-white/8 bg-card/50 px-4 py-3"
            >
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
                <Check className="size-3.5" aria-hidden />
              </span>
              <span className="text-sm leading-relaxed text-paper/90">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function PropagationVisual() {
  const ref = useReveal<HTMLDivElement>()
  // A fleet of endpoints that light up in a repeating wave.
  const endpoints = Array.from({ length: 12 })

  return (
    <div ref={ref} className="reveal group mt-14">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 rounded-2xl border border-white/10 bg-card/40 p-6 sm:flex-row sm:gap-4 sm:p-8">
        {/* Source: defined once */}
        <div className="flex shrink-0 flex-col items-center gap-2 text-center">
          <span className="relative inline-flex size-16 items-center justify-center rounded-2xl border border-gold/40 bg-gold-tint text-gold">
            <FileCheck2 className="size-7" aria-hidden />
            <span className="ae-ping absolute inset-0 rounded-2xl border border-gold/50" />
          </span>
          <span className="text-sm font-extrabold text-paper">Defined once</span>
        </div>

        {/* Flow: pulses travel from source to fleet */}
        <div className="relative flex h-10 flex-1 items-center overflow-hidden px-1">
          <div className="h-px w-full bg-gradient-to-r from-gold/50 via-white/15 to-gold/30" />
          {[0, 1, 2].map((n) => (
            <span
              key={n}
              className="ae-flow-dot absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-gold shadow-[0_0_10px_rgba(200,169,74,0.9)]"
              style={{ animationDelay: `${n * 1}s` }}
            />
          ))}
        </div>

        {/* Fleet: enforced everywhere */}
        <div className="flex shrink-0 flex-col items-center gap-2 text-center">
          <div className="grid grid-cols-4 gap-1.5">
            {endpoints.map((_, i) => (
              <span
                key={i}
                className="ae-node size-4 rounded-[4px] border border-gold/30 bg-navy/60"
                style={{ animationDelay: `${(i % 4) * 0.18 + Math.floor(i / 4) * 0.12}s` }}
              />
            ))}
          </div>
          <span className="text-sm font-extrabold text-paper">Enforced everywhere</span>
        </div>
      </div>

      <p className="mt-5 text-center text-sm font-semibold uppercase tracking-[0.16em] text-muted-blue">
        Define once. <span className="text-gold">Enforce everywhere</span>, automatically.
      </p>

      <style>{`
        @keyframes ae-flow-dot {
          0% { left: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
        .ae-flow-dot { animation: ae-flow-dot 3s linear infinite; }
        @keyframes ae-node-pulse {
          0%, 100% { background-color: rgba(15,27,45,0.6); border-color: rgba(200,169,74,0.3); box-shadow: none; }
          50% { background-color: var(--gold); border-color: var(--gold); box-shadow: 0 0 10px rgba(200,169,74,0.7); }
        }
        .ae-node { animation: ae-node-pulse 2.4s ease-in-out infinite; }
        .group:hover .ae-node { animation-duration: 1.1s; }
        .group:hover .ae-flow-dot { animation-duration: 1.4s; }
        @keyframes ae-ping {
          0% { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        .ae-ping { animation: ae-ping 2.4s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ae-flow-dot, .ae-node, .ae-ping { animation: none; }
          .ae-flow-dot { display: none; }
        }
      `}</style>
    </div>
  )
}
