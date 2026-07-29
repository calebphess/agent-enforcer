'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { login, setToken, getToken } from '@/lib/api'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (getToken()) router.replace('/')
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await login(username.trim(), password)
      setToken(res.token)
      router.replace('/')
    } catch {
      setError('Invalid username or password.')
      setSubmitting(false)
    }
  }

  return (
    <main className="console-bg relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="orbit-field pointer-events-none absolute inset-0" aria-hidden>
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

      <div className="relative flex w-full max-w-[420px] flex-col items-center">
        <div className="animate-float relative w-full overflow-hidden rounded-xl border-t-2 border-t-gold bg-navy-2 shadow-float ring-1 ring-white/10">
          <div className="flex flex-col gap-6 p-8">
            <div className="flex items-center gap-4">
              <img
                src="/agent-enforcer-icon.png"
                alt="Agent Enforcer"
                className="size-14 shrink-0 drop-shadow-[0_4px_16px_rgba(200,169,74,0.35)]"
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-dark">
                  Agent Enforcer
                </span>
                <h1 className="text-2xl font-extrabold leading-none tracking-tight text-paper">
                  Welcome back
                </h1>
              </div>
            </div>

            <p className="-mt-1 text-sm leading-relaxed text-[#9AA6BB]">
              Sign in to the enforcement console.
            </p>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/15 px-3 py-2.5 text-sm text-[#F3B4AC]"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="username" className="text-xs font-semibold text-[#9AA6BB]">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={inputClass}
                  placeholder="admin"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-xs font-semibold text-[#9AA6BB]">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-gold px-4 text-sm font-bold text-navy transition-all hover:-translate-y-px hover:bg-[#D4B75C] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-gold/50 disabled:pointer-events-none disabled:opacity-60"
              >
                {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>

              <div className="mt-1 flex items-center justify-center gap-2">
                <span className="text-xs font-medium text-[#5A6a83]">Powered by</span>
                <img
                  src="/alchemist-logo-white.png"
                  alt="Alchemist"
                  className="h-3.5 w-auto opacity-80"
                />
              </div>
            </form>
          </div>
        </div>

        <p className="mt-5 text-xs font-semibold tracking-wide text-gold-dark">Stop the Slop.</p>
      </div>

      <footer className="relative mt-10">
        <p className="text-center text-xs text-[#5A6a83]">
          © 2026 Alchemist. All rights reserved. Agent Enforcer is a trademark of Alchemist.
        </p>
      </footer>
    </main>
  )
}

const inputClass = cn(
  'h-10 w-full rounded-md border border-white/10 bg-[#0B1B31] px-3 text-sm text-paper',
  'placeholder:text-[#4E5C74] transition-colors outline-none',
  'focus-visible:border-gold focus-visible:ring-3 focus-visible:ring-gold/40',
)
