'use client'

import { ShieldCheck, TrendingDown, Code2 } from 'lucide-react'
import { SectionHeading } from '@/components/section-heading'
import { CountUp } from '@/components/count-up'
import { useReveal } from '@/hooks/use-scroll-fx'

const CONTROLS = [
  'Parameterized queries only. SQL injection blocked at the source',
  'Secrets via environment variables. No hardcoded credentials, ever',
  'Non-root container execution. Least-privilege Docker by default',
  'HTTPS-only endpoints. Enforced protocol standards',
  'Approved library lists. Unapproved dependencies flagged',
  'Custom policy documents for your own internal standards',
]

const FRAMEWORKS = ['NIST 800-53', 'CMMC', 'FedRAMP', 'STIG']

export function Value() {
  const ref = useReveal<HTMLDivElement>()

  return (
    <section id="value" ref={ref} className="relative border-t border-white/5 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Three Pillars of Value"
          title="Security, savings, and standards, enforced by default"
          description="Agent Enforcer delivers compounding value from day one: hardened security posture, dramatic token savings, and uniform coding standards across your entire organization."
        />

        <div className="mt-16 flex flex-col gap-6">
          {/* Pillar 1: Security & Compliance */}
          <div className="reveal card-hover grid gap-8 overflow-hidden rounded-2xl border border-white/10 bg-card/60 p-8 lg:grid-cols-2 lg:p-10">
            <div>
              <PillarBadge index="01" icon={ShieldCheck} label="Security & Compliance" />
              <h3 className="mt-5 text-2xl font-extrabold text-paper">
                Controls active before code is written
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-blue">
                AI agents do exactly what they&apos;re told. If they aren&apos;t told your security
                requirements, they&apos;ll write code that ignores them. Agent Enforcer embeds your
                controls directly into the AI&apos;s operating context.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {FRAMEWORKS.map((f) => (
                  <span
                    key={f}
                    className="rounded-md border border-gold/30 bg-gold-tint px-3 py-1 text-xs font-bold tracking-wide text-gold"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
            <ul className="grid gap-2.5 self-center">
              {CONTROLS.map((c) => (
                <li
                  key={c}
                  className="flex items-start gap-2.5 rounded-lg border border-white/8 bg-navy/50 px-3.5 py-2.5"
                >
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                  <span className="text-[13px] leading-snug text-paper/90">{c}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pillar 2: Token Cost Reduction */}
          <div className="reveal card-hover grid gap-8 overflow-hidden rounded-2xl border border-white/10 bg-card/60 p-8 lg:grid-cols-2 lg:p-10">
            <div className="order-2 lg:order-1">
              <TokenBars />
            </div>
            <div className="order-1 lg:order-2">
              <PillarBadge index="02" icon={TrendingDown} label="Token Cost Reduction" />
              <h3 className="mt-5 text-2xl font-extrabold text-paper">
                Up to <CountUp to={35} suffix="%" className="text-gold-gradient" />{' '}
                savings on developer AI spend
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-blue">
                Unguided agents iterate wastefully. They assume, get corrected, retry, and loop.
                Every exchange burns tokens. Agent Enforcer eliminates the most expensive loops by
                giving the AI the right context from the first prompt.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <Stat
                  value={<CountUp to={3.4} decimals={1} prefix="$" suffix="M" />}
                  label="Conservative annual savings*"
                />
                <Stat
                  value={<CountUp to={4.2} decimals={1} prefix="$" suffix="M" />}
                  label="Likely annual savings*"
                />
              </div>
              <p className="mt-4 text-xs text-muted-blue/70">
                *Modeled on $1M/month organization-wide token spend ($12M/year): 28% conservative,
                35% likely reduction.
              </p>
            </div>
          </div>

          {/* Pillar 3: Uniform Coding Standards */}
          <div className="reveal card-hover grid gap-8 overflow-hidden rounded-2xl border border-white/10 bg-card/60 p-8 lg:grid-cols-2 lg:p-10">
            <div>
              <PillarBadge index="03" icon={Code2} label="Uniform Coding Standards" />
              <h3 className="mt-5 text-2xl font-extrabold text-paper">
                Same task. Same AI. Different rules.
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-blue">
                When 50 developers prompt the same AI differently, you get 50 different patterns and
                50 different security postures. Agent Enforcer standardizes output across your entire
                development organization.
              </p>
              <div className="mt-6 rounded-lg border border-gold/25 bg-gold-tint p-4">
                <p className="text-sm leading-relaxed text-paper">
                  <span className="font-extrabold text-gold">Demonstrated result:</span> enforced AI
                  sessions produced <span className="font-bold">zero</span> critical vulnerabilities
                  versus <span className="font-bold">two</span> in unenforced sessions. Same model,
                  same task.
                </p>
              </div>
            </div>
            <CodeDiff />
          </div>
        </div>
      </div>
    </section>
  )
}

function PillarBadge({
  index,
  icon: Icon,
  label,
}: {
  index: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex size-11 items-center justify-center rounded-xl border border-gold/30 bg-gold-tint text-gold">
        <Icon className="size-5" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-mono text-xs font-bold text-gold">{index}</span>
        <span className="text-sm font-bold uppercase tracking-[0.12em] text-muted-blue">
          {label}
        </span>
      </span>
    </div>
  )
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-navy/50 px-4 py-3">
      <div className="tabular text-2xl font-extrabold text-paper">{value}</div>
      <div className="mt-1 text-xs text-muted-blue">{label}</div>
    </div>
  )
}

function TokenBars() {
  const ref = useReveal<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className="reveal-scale flex h-full flex-col justify-center rounded-xl border border-white/10 bg-navy/50 p-6"
    >
      <div className="mb-6 flex items-baseline justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-blue">
          Monthly token spend
        </p>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-blue/70">
          Conservative
        </span>
      </div>
      <div className="flex items-end justify-around gap-4 sm:gap-8" style={{ height: 220 }}>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
          <div className="flex h-[180px] w-full max-w-[6rem] items-end">
            <div className="token-bar w-full rounded-t-md bg-white/15" style={{ height: 180 }} />
          </div>
          <span className="text-center text-xs font-semibold text-muted-blue">Unenforced AI</span>
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col items-center gap-3">
          <span className="absolute -top-2 z-10 rounded-full border border-gold/40 bg-gold-tint px-2 py-0.5 text-[10px] font-bold text-gold">
            −28%
          </span>
          <div className="flex h-[180px] w-full max-w-[6rem] items-end">
            <div
              className="token-bar w-full rounded-t-md bg-gradient-to-t from-gold-dark to-gold"
              style={{ height: 130, transitionDelay: '150ms' }}
            />
          </div>
          <span className="text-center text-xs font-semibold text-paper">With Enforcer</span>
        </div>
      </div>
      <style>{`
        .token-bar { transform: scaleY(0); transform-origin: bottom; transition: transform 1.3s cubic-bezier(0.22,1,0.36,1); }
        .is-visible .token-bar, .token-bar.is-visible { transform: scaleY(1); }
        @media (prefers-reduced-motion: reduce) { .token-bar { transform: scaleY(1); transition: none; } }
      `}</style>
    </div>
  )
}

function CodeDiff() {
  return (
    <div className="grid gap-3 self-center sm:grid-cols-2">
      <div className="overflow-hidden rounded-lg border border-danger/30 bg-navy">
        <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
          <span className="size-2 rounded-full bg-danger" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-danger">
            Without Enforcer
          </span>
        </div>
        <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-muted-blue">
          {`def get_user(id):
  q = f"SELECT * FROM
    users WHERE id={id}"
  return db.run(q)
  # no types
  # no docstring`}
        </pre>
      </div>
      <div className="overflow-hidden rounded-lg border border-gold/30 bg-navy">
        <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
          <span className="size-2 rounded-full bg-gold" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-gold">
            With Enforcer
          </span>
        </div>
        <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-paper/90">
          {`def get_user(id: int) -> User:
  """Fetch a user by id."""
  return db.query(
    "SELECT * FROM users "
    "WHERE id = %s", (id,),
  )`}
        </pre>
      </div>
    </div>
  )
}
