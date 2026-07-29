'use client'

import Link from 'next/link'
import { Check, InfinityIcon } from 'lucide-react'
import { SectionHeading } from '@/components/section-heading'
import { useReveal } from '@/hooks/use-scroll-fx'

const TIERS = [
  {
    name: 'Division',
    seats: 'Up to 250 seats',
    featured: false,
    features: [
      'Centralized policy configuration',
      'Cloud-native deployment',
      'Automatic rule propagation',
      'Fine-grained fleet management',
    ],
  },
  {
    name: 'Organization',
    seats: 'Up to 1,000 seats',
    featured: true,
    badge: 'Most Common',
    features: [
      'Everything in Division',
      'Air-gap deployment support',
      'Agents for custom operating systems',
      'Hands-on initial policy uploading',
    ],
  },
  {
    name: 'Enterprise',
    seats: 'Up to 5,000 seats',
    featured: false,
    features: [
      'Everything in Organization',
      'Prioritized feature requests',
      'Dedicated training',
      '1 managed enforcement specialist',
    ],
  },
]

export function Pricing() {
  const ref = useReveal<HTMLDivElement>()

  return (
    <section id="pricing" ref={ref} className="relative border-t border-white/5 py-24 sm:py-32">
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-25" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Plans"
          title="Plans built for every scale"
          description="Choose the plan that matches your workforce. Every plan includes system-level enforcement, automatic distribution, and full audit trails."
        />

        <div className="mt-16 grid items-stretch gap-5 lg:grid-cols-3">
          {TIERS.map((tier, i) => (
            <div
              key={tier.name}
              className={`reveal card-hover relative flex flex-col rounded-2xl border p-8 ${
                tier.featured
                  ? 'border-gold/50 bg-card glow-gold lg:-translate-y-3'
                  : 'border-white/10 bg-card/60'
              }`}
              style={{ transitionDelay: `${i * 90}ms` }}
            >
              <span
                className={`absolute inset-x-0 top-0 h-1 rounded-t-2xl ${
                  tier.featured ? 'bg-gradient-to-r from-gold-dark via-gold to-gold-light' : 'bg-white/10'
                }`}
                aria-hidden
              />
              {tier.badge ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gold px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-navy">
                  {tier.badge}
                </span>
              ) : null}

              <h3 className="text-lg font-extrabold text-paper">{tier.name}</h3>
              <p className="mt-1 text-sm text-muted-blue">{tier.seats}</p>
              <div className="mt-5">
                <span className="text-lg font-extrabold text-gold">Contact for pricing</span>
              </div>

              <ul className="mt-6 flex flex-col gap-2.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-paper/90">
                    <Check className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={`/contact?tier=${encodeURIComponent(tier.name)}`}
                className={`mt-8 inline-flex h-11 items-center justify-center rounded-md text-sm font-bold transition-all hover:-translate-y-0.5 ${
                  tier.featured
                    ? 'bg-gold text-navy hover:bg-gold-light'
                    : 'border border-white/15 bg-white/5 text-paper hover:border-gold/40 hover:bg-white/10'
                }`}
              >
                Contact Sales
              </Link>
            </div>
          ))}
        </div>

        {/* Unlimited band */}
        <div className="reveal mt-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-gold/25 bg-gold-tint p-6 sm:flex-row sm:items-center sm:gap-5">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl border border-gold/40 bg-navy/40 text-gold">
              <InfinityIcon className="size-6" aria-hidden />
            </span>
            <div className="flex-1">
              <h4 className="font-extrabold text-paper">Unlimited</h4>
              <p className="text-sm text-muted-blue">
                Unlimited seats, organization-wide, with a dedicated account team.
              </p>
            </div>
            <span className="rounded-full border border-gold/40 bg-navy/40 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gold">
              Dedicated account team
            </span>
          </div>
        </div>

        <p className="reveal mt-8 text-center text-sm text-muted-blue">
          <span className="font-bold text-gold">Founding Partner Rate</span> available for the first
          organization engagement. Contact for details.
        </p>
      </div>
    </section>
  )
}
