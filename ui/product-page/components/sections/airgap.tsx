'use client'

import { Waypoints, Unplug, CloudOff, PackageX, SignalZero, ShieldCheck } from 'lucide-react'
import { SectionHeading } from '@/components/section-heading'
import { useReveal } from '@/hooks/use-scroll-fx'

const UNKNOWNS = [
  {
    icon: Waypoints,
    title: 'Unknown network topography',
    body: 'The agent has no map. It probes blindly for services and hosts that may not live where it expects them to.',
  },
  {
    icon: Unplug,
    title: 'URLs that don\u2019t route',
    body: 'Endpoints it assumes are reachable time out, resolve to nothing, or sit behind a proxy it never anticipated.',
  },
  {
    icon: CloudOff,
    title: 'Cloud features that aren\u2019t there',
    body: 'Managed services and cloud APIs the model instinctively reaches for simply do not exist inside the enclave.',
  },
  {
    icon: PackageX,
    title: 'Libraries and repos behind upstream',
    body: 'Internal mirrors and package registries lag public sources, so its first-choice versions and imports fail.',
  },
]

export function AirGap() {
  const ref = useReveal<HTMLDivElement>()

  return (
    <section ref={ref} className="relative overflow-hidden border-t border-white/5 py-24 sm:py-32">
      {/* Foggy, signal-lost backdrop */}
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-20" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(224,104,90,0.10), transparent 55%), radial-gradient(ellipse at 50% 100%, rgba(15,27,45,0.6), transparent 60%)',
        }}
        aria-hidden
      />
      {/* Sweeping scanline */}
      <div className="ag-scan pointer-events-none absolute inset-x-0 top-0 h-24 opacity-40" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Disconnected Environments"
          title="Agents fly blind in the air gap"
          description="On the open internet, an AI agent can lean on assumptions. Inside an air-gapped enclave, those assumptions quietly break, and the agent doesn't know it."
        />

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {UNKNOWNS.map((u, i) => {
            const Icon = u.icon
            return (
              <div
                key={u.title}
                className="reveal group relative overflow-hidden rounded-xl border border-white/10 bg-card/60 p-6 transition-colors hover:border-danger/40"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                {/* Watermark question glyph */}
                <span
                  className="pointer-events-none absolute -right-2 -top-3 font-mono text-6xl font-extrabold text-white/[0.04] transition-colors group-hover:text-danger/10"
                  aria-hidden
                >
                  ?
                </span>
                <div className="mb-4 inline-flex size-11 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 text-danger">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3 className="text-base font-bold text-paper">{u.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-blue">{u.body}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-danger/25 bg-danger/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger/80">
                  <SignalZero className="size-3" aria-hidden /> Unresolved
                </span>
              </div>
            )
          })}
        </div>

        {/* The compounding cost + how Enforcer answers it */}
        <div className="reveal-scale mt-6 grid gap-6 rounded-2xl border border-white/10 bg-card/70 p-8 shadow-float lg:grid-cols-2 lg:p-10">
          <div>
            <span className="eyebrow">The Compounding Cost</span>
            <h3 className="mt-3 text-2xl font-extrabold text-paper">
              Every wrong assumption becomes token swirl
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-blue">
              The agent retries dead routes, hunts for services that were never deployed, and cycles
              through versions that don&apos;t exist. Each failed guess spawns another, so churn in a
              disconnected environment runs even hotter than on the open internet, burning budget on
              loops that can never resolve.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-4 rounded-xl border border-gold/25 bg-gold-tint p-6">
            <span className="inline-flex size-12 items-center justify-center rounded-xl border border-gold/40 bg-navy/40 text-gold">
              <ShieldCheck className="size-6" aria-hidden />
            </span>
            <p className="text-sm leading-relaxed text-paper">
              <span className="font-extrabold text-gold">Agent Enforcer front-loads ground truth.</span>{' '}
              Your real network map, approved endpoints, available services, and internal package
              sources are pinned into every session, so the agent stops guessing and starts building
              against reality.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .ag-scan {
          background: linear-gradient(180deg, transparent, rgba(200,169,74,0.18), transparent);
          animation: ag-scan 6s ease-in-out infinite;
        }
        @keyframes ag-scan {
          0% { transform: translateY(0); opacity: 0; }
          15% { opacity: 0.5; }
          85% { opacity: 0.5; }
          100% { transform: translateY(680px); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ag-scan { animation: none; display: none; }
        }
      `}</style>
    </section>
  )
}
