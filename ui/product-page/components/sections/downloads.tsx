'use client'

import { Download } from 'lucide-react'
import { SectionHeading } from '@/components/section-heading'
import { useReveal } from '@/hooks/use-scroll-fx'

const INSTALLER_BASE = 'https://agent-enforcer-rpm.s3.amazonaws.com/installers/latest'

const PLATFORMS = [
  {
    name: 'Rocky Linux / RHEL 9',
    icon: '/os/linux.svg',
    available: true,
    filename: 'agent-enforcer.rpm',
    url: `${INSTALLER_BASE}/agent-enforcer.rpm`,
    install: 'sudo rpm -i agent-enforcer.rpm',
    note: 'Runs as a systemd service. Registers and syncs on boot.',
  },
  {
    name: 'macOS',
    icon: '/os/apple.svg',
    available: true,
    filename: 'agent-enforcer.pkg',
    url: `${INSTALLER_BASE}/agent-enforcer.pkg`,
    install: 'Double-click to install',
    note: 'Unsigned preview build — right-click the .pkg and choose Open on first install. Auto-start on boot is configurable.',
  },
  {
    name: 'Windows',
    icon: '/os/windows.svg',
    available: false,
    filename: null,
    url: null,
    install: null,
    note: 'Windows agent is on the roadmap.',
  },
]

export function Downloads() {
  const ref = useReveal<HTMLDivElement>()

  return (
    <section id="downloads" ref={ref} className="relative border-t border-white/5 py-24 sm:py-32">
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-25" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Downloads"
          title="Install the enforcement agent"
          description="One lightweight agent per host. It registers a license, pulls your generated policy bundles, and keeps every developer's AI tooling in compliance — even offline."
        />

        <div className="mt-16 grid items-stretch gap-5 lg:grid-cols-3">
          {PLATFORMS.map((p) => (
            <div
              key={p.name}
              className={`reveal card-hover flex flex-col rounded-2xl border p-8 ${
                p.available
                  ? 'border-white/10 bg-card/60'
                  : 'border-white/6 bg-card/30 opacity-70'
              }`}
            >
              <div className="flex items-center gap-4">
                <span
                  className={`size-10 shrink-0 ${p.available ? 'bg-gold' : 'bg-muted-blue/50'}`}
                  style={{
                    maskImage: `url(${p.icon})`,
                    WebkitMaskImage: `url(${p.icon})`,
                    maskRepeat: 'no-repeat',
                    WebkitMaskRepeat: 'no-repeat',
                    maskSize: 'contain',
                    WebkitMaskSize: 'contain',
                    maskPosition: 'center',
                    WebkitMaskPosition: 'center',
                  }}
                  aria-hidden
                />
                <div className="flex flex-col">
                  <h3 className={`text-lg font-extrabold ${p.available ? 'text-paper' : 'text-muted-blue'}`}>
                    {p.name}
                  </h3>
                  {p.available ? (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gold">
                      <span className="size-1.5 rounded-full bg-gold" aria-hidden /> Available
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-blue">
                      Coming soon
                    </span>
                  )}
                </div>
              </div>

              {p.install && (
                <code className="mt-6 block rounded-lg border border-white/10 bg-navy/60 px-4 py-3 font-mono text-xs text-paper/90">
                  {p.install}
                </code>
              )}

              <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-blue">{p.note}</p>

              {p.url ? (
                <a
                  href={p.url}
                  download={p.filename ?? undefined}
                  className="group mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-gold px-6 text-sm font-bold text-navy transition-all hover:-translate-y-0.5 hover:bg-gold-light"
                >
                  <Download className="size-4" aria-hidden />
                  Download {p.filename}
                </a>
              ) : (
                <span className="mt-6 inline-flex h-11 items-center justify-center rounded-md border border-white/12 bg-white/5 px-6 text-sm font-semibold text-muted-blue">
                  Not yet available
                </span>
              )}
            </div>
          ))}
        </div>

        <p className="reveal mt-8 text-center text-sm text-muted-blue">
          Installers connect to your organization&apos;s enforcement endpoint — run{' '}
          <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-paper/90">
            sudo agent-enforcer register
          </code>{' '}
          after installing.
        </p>
      </div>
    </section>
  )
}
