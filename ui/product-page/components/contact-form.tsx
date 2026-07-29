'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import { submitContact } from '@/lib/api'

const TIERS = ['Division', 'Organization', 'Enterprise', 'Unlimited', 'Not sure yet']

type FieldErrors = Partial<Record<'name' | 'email' | 'organization' | 'tier', string>>

export function ContactForm() {
  const params = useSearchParams()
  const presetTier = params.get('tier')
  const defaultTier = presetTier && TIERS.includes(presetTier) ? presetTier : 'Not sure yet'

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('submitting')
    setFieldErrors({})
    setFormError(null)

    const form = e.currentTarget
    const data = new FormData(form)
    const payload = {
      name: String(data.get('name') ?? ''),
      email: String(data.get('email') ?? ''),
      organization: String(data.get('organization') ?? ''),
      tier: String(data.get('tier') ?? ''),
      seats: String(data.get('seats') ?? ''),
      message: String(data.get('message') ?? ''),
    }

    try {
      const result = await submitContact(payload)

      if (!result.ok) {
        if (result.body?.fields) setFieldErrors(result.body.fields)
        setFormError(result.body?.error ?? 'Something went wrong. Please try again.')
        setStatus('error')
        return
      }

      setStatus('success')
      form.reset()
    } catch {
      setFormError('Network error. Please try again.')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="reveal is-visible flex flex-col items-center rounded-2xl border border-gold/40 bg-card p-10 text-center glow-gold">
        <span className="mb-5 inline-flex size-14 items-center justify-center rounded-full border border-gold/40 bg-gold-tint text-gold">
          <CheckCircle2 className="size-7" aria-hidden />
        </span>
        <h2 className="text-2xl font-extrabold text-paper">Briefing request received</h2>
        <p className="mt-3 max-w-md text-pretty leading-relaxed text-muted-blue">
          An enforcement specialist will reach out within one business day to schedule your
          Agent Enforcer briefing.
        </p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="mt-7 inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-6 text-sm font-semibold text-paper transition-colors hover:border-gold/40 hover:bg-white/10"
        >
          Submit another request
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-white/10 bg-card/70 p-6 sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor="name" error={fieldErrors.name}>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            className={inputCls(!!fieldErrors.name)}
            placeholder="Jane Doe"
          />
        </Field>

        <Field label="Work email" htmlFor="email" error={fieldErrors.email}>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={inputCls(!!fieldErrors.email)}
            placeholder="jane@company.com"
          />
        </Field>

        <Field label="Organization" htmlFor="organization" error={fieldErrors.organization}>
          <input
            id="organization"
            name="organization"
            type="text"
            autoComplete="organization"
            required
            className={inputCls(!!fieldErrors.organization)}
            placeholder="Acme Corp"
          />
        </Field>

        <Field label="Approx. seats" htmlFor="seats">
          <input
            id="seats"
            name="seats"
            type="text"
            inputMode="numeric"
            className={inputCls(false)}
            placeholder="e.g. 500"
          />
        </Field>

        <Field label="Interested tier" htmlFor="tier" className="sm:col-span-2" error={fieldErrors.tier}>
          <select id="tier" name="tier" defaultValue={defaultTier} className={inputCls(!!fieldErrors.tier)}>
            {TIERS.map((t) => (
              <option key={t} value={t} className="bg-navy text-paper">
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="What are you trying to govern?" htmlFor="message" className="sm:col-span-2">
          <textarea
            id="message"
            name="message"
            rows={4}
            className="w-full resize-y rounded-md border border-white/12 bg-navy/50 px-3.5 py-2.5 text-sm text-paper placeholder:text-muted-blue/60 outline-none transition-colors focus:border-gold/60 focus:ring-1 focus:ring-gold/30"
            placeholder="Tell us about your AI tooling, compliance requirements, and timeline."
          />
        </Field>
      </div>

      {formError ? (
        <p role="alert" className="mt-5 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="group mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-gold px-8 text-sm font-bold text-navy transition-all hover:-translate-y-0.5 hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
      >
        {status === 'submitting' ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Sending…
          </>
        ) : (
          <>
            Request Briefing
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </>
        )}
      </button>

      <p className="mt-4 text-xs text-muted-blue">
        By submitting, you agree to be contacted by an enforcement specialist about Agent Enforcer.
      </p>
    </form>
  )
}

function inputCls(hasError: boolean) {
  return `h-11 w-full rounded-md border bg-navy/50 px-3.5 text-sm text-paper placeholder:text-muted-blue/60 outline-none transition-colors focus:border-gold/60 focus:ring-1 focus:ring-gold/30 ${
    hasError ? 'border-red-500/60' : 'border-white/12'
  }`
}

function Field({
  label,
  htmlFor,
  error,
  className = '',
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-blue">
        {label}
      </label>
      {children}
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
    </div>
  )
}
