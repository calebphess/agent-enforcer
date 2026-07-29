import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { ContactForm } from '@/components/contact-form'

export const metadata = {
  title: 'Request a Briefing | Agent Enforcer',
  description:
    'Request a briefing with an enforcement specialist to see how Agent Enforcer governs your AI agents.',
}

export default function ContactPage() {
  return (
    <main className="console-bg relative min-h-screen overflow-hidden">
      {/* Orbital field backdrop */}
      <div className="orbit-field pointer-events-none absolute inset-0 opacity-50" aria-hidden>
        <div className="orbit orbit-1">
          <span className="orbit-node" />
        </div>
        <div className="orbit orbit-2">
          <span className="orbit-node" />
        </div>
      </div>
      <div
        className="pointer-events-none absolute left-1/2 top-0 size-[420px] -translate-x-1/2 rounded-full opacity-30 blur-[120px]"
        style={{ background: 'radial-gradient(circle, rgba(200,169,74,0.45), transparent 70%)' }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-blue transition-colors hover:text-paper"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to overview
        </Link>

        <div className="mt-8 flex flex-col items-start">
          <img
            src="/agent-enforcer-icon.png"
            alt="Agent Enforcer"
            className="mb-6 size-16 drop-shadow-[0_8px_30px_rgba(200,169,74,0.4)]"
          />
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold-tint px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
            <ShieldCheck className="size-3.5" aria-hidden />
            Request a Briefing
          </span>
          <h1 className="text-balance text-4xl font-extrabold tracking-tight text-paper sm:text-5xl">
            Let&apos;s govern your <span className="text-gold-gradient">AI.</span>
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-lg leading-relaxed text-muted-blue">
            Tell us about your environment and an enforcement specialist will reach out to
            schedule a briefing tailored to your organization.
          </p>
        </div>

        <div className="mt-10">
          <Suspense fallback={<div className="h-96 rounded-2xl border border-white/10 bg-card/40" />}>
            <ContactForm />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
