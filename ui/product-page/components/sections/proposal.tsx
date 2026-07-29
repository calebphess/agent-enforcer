'use client'

import { X, ShieldCheck } from 'lucide-react'
import { SectionHeading } from '@/components/section-heading'
import { CountUp } from '@/components/count-up'
import { useReveal } from '@/hooks/use-scroll-fx'

const ROI = [
  { label: 'Token Savings', value: 3.36, color: 'var(--gold)' },
  { label: 'Security Incident Savings', value: 5, color: '#5b7aa8' },
  { label: 'Recovered Dev Hours', value: 5, color: '#3d5578' },
]
const ROI_TOTAL = 15 // chart scale to $15M

const RISKS = ['Hardcoded credentials', 'SQL injection', 'Privilege escalation']

export function Proposal() {
  const ref = useReveal<HTMLDivElement>()

  return (
    <section id="proposal" ref={ref} className="relative border-t border-white/5 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Founding Partner Proposal"
          title="The economic case is decisive"
          description="A full Organization-tier deployment for up to 1,000 enforcement agents, dedicated Managed Enforcement Specialists, and a Founding Partner rate. Projected to return its cost in token savings alone within 12 to 18 months."
        />

        {/* Investment callouts */}
        <div className="reveal mt-14 grid gap-4 sm:grid-cols-2">
          <div className="card-hover rounded-2xl border border-gold/30 bg-gold-tint p-8">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-gold">
              Year 1 Investment
            </span>
            <div className="tabular mt-2 text-4xl font-extrabold text-paper">
              <CountUp to={2.5} decimals={1} prefix="$" suffix="M" />
            </div>
            <p className="mt-2 text-sm text-muted-blue">
              Founding Partner rate. 23% below standard.
            </p>
          </div>
          <div className="card-hover rounded-2xl border border-white/10 bg-card/60 p-8">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-blue">
              Year 2+ Annual
            </span>
            <div className="tabular mt-2 text-4xl font-extrabold text-paper">
              <CountUp to={3.25} decimals={2} prefix="$" suffix="M" />
            </div>
            <p className="mt-2 text-sm text-muted-blue">Standard renewal rate, per year.</p>
          </div>
        </div>

        {/* ROI breakdown + risk gauges */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* ROI stacked bar */}
          <div className="reveal-left card-hover rounded-2xl border border-white/10 bg-card/60 p-8">
            <h3 className="text-lg font-extrabold text-paper">Cost savings breakdown</h3>
            <p className="mt-1 text-sm text-muted-blue">Modeled against $12M annual token spend.</p>

            <div className="mt-8">
              <div className="relative mb-2">
                <span
                  className="absolute -top-5 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-gold"
                  style={{ left: `${(2.5 / ROI_TOTAL) * 100}%` }}
                >
                  Break-even $2.5M
                </span>
              </div>
              <div className="relative flex h-9 w-full overflow-hidden rounded-md border border-white/10">
                {ROI.map((seg) => (
                  <div
                    key={seg.label}
                    className="h-full"
                    style={{ width: `${(seg.value / ROI_TOTAL) * 100}%`, background: seg.color }}
                  />
                ))}
                <div
                  className="absolute top-0 h-full w-0.5 bg-paper"
                  style={{ left: `${(2.5 / ROI_TOTAL) * 100}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[11px] tabular text-muted-blue">
                <span>$0</span>
                <span>$5M</span>
                <span>$10M</span>
                <span>$15M</span>
              </div>
            </div>

            <ul className="mt-6 grid gap-2.5">
              {ROI.map((seg) => (
                <li key={seg.label} className="flex items-center gap-2.5 text-sm">
                  <span className="size-3 shrink-0 rounded-sm" style={{ background: seg.color }} />
                  <span className="text-paper/90">{seg.label}</span>
                  <span className="tabular ml-auto font-bold text-paper">
                    ${seg.value.toFixed(seg.value % 1 ? 2 : 0)}M{seg.value >= 5 ? '+' : ''}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-blue/70">
              Token savings assume a 28% efficiency gain on $12M annual spend, exceeding Year 1
              investment on efficiency alone.
            </p>
          </div>

          {/* Risk reduction */}
          <div className="reveal-right card-hover rounded-2xl border border-white/10 bg-card/60 p-8">
            <h3 className="text-lg font-extrabold text-paper">Security risk reduction</h3>
            <p className="mt-1 text-sm text-muted-blue">
              In controlled testing, unenforced sessions averaged one critical vulnerability per
              task. Enforced sessions produced zero.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <RiskGauge label="Without Enforcer" percent={0.86} color="#e0685a" />
              <RiskGauge label="With Enforcer" percent={0.16} color="var(--gold)" />
            </div>

            <ul className="mt-6 divide-y divide-white/8 rounded-lg border border-white/8">
              {RISKS.map((r) => (
                <li key={r} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-paper/90">{r}</span>
                  <span className="flex items-center gap-6">
                    <X className="size-4 text-danger" aria-label="Vulnerable without enforcer" />
                    <ShieldCheck className="size-4 text-gold" aria-label="Blocked with enforcer" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="reveal mx-auto mt-10 max-w-3xl text-balance text-center text-sm italic leading-relaxed text-muted-blue">
          Agent Enforcer does not replace your security team. It makes your security team&apos;s
          requirements impossible for AI agents to ignore.
        </p>
      </div>
    </section>
  )
}

function RiskGauge({ label, percent, color }: { label: string; percent: number; color: string }) {
  const ref = useReveal<HTMLDivElement>()
  // Semicircle arc: true drawn length is pi * r (r = 46) ≈ 144.5 units.
  const arcLen = 144.5
  const dash = arcLen * percent

  return (
    <div ref={ref} className="flex flex-col items-center rounded-lg border border-white/8 bg-navy/50 p-4">
      <svg viewBox="0 0 120 80" className="w-full max-w-[140px]" aria-hidden>
        <path d="M 14 74 A 46 46 0 1 1 106 74" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" strokeLinecap="round" />
        <path
          d="M 14 74 A 46 46 0 1 1 106 74"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${arcLen}`}
          style={{ transition: 'stroke-dasharray 1.4s cubic-bezier(0.22,1,0.36,1)' }}
        />
        <text x="60" y="60" textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--paper)">
          {Math.round(percent * 100)}%
        </text>
      </svg>
      <div className="mt-1 flex w-full justify-between px-2 text-[9px] font-semibold text-muted-blue">
        <span>LOW</span>
        <span>HIGH</span>
      </div>
      <span className="mt-1 text-xs font-bold text-paper">{label}</span>
    </div>
  )
}
