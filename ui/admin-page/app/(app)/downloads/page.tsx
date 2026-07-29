'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { Download } from 'lucide-react'
import { usePageChrome } from '@/components/app-shell'
import { PageHeading } from '@/components/page-heading'
import { InstallersGrid } from '@/components/downloads/installers-grid'
import { BundlesGrid } from '@/components/downloads/bundles-grid'
import { getInstallerDownloads, getBundleDownloads } from '@/lib/api'

export default function DownloadsPage() {
  const installers = useSWR('downloads-installers', getInstallerDownloads)
  const bundles = useSWR('downloads-bundles', getBundleDownloads)

  const refresh = useCallback(async () => {
    await Promise.all([installers.mutate(), bundles.mutate()])
  }, [installers, bundles])

  usePageChrome('Downloads', refresh)

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        eyebrow="Artifacts"
        title="Downloads"
        subline="Agent installers for your hosts, and the generated enforcement packages for manual distribution."
        icon={
          <span className="flex size-8 items-center justify-center rounded-md bg-gold-tint">
            <Download className="size-5 text-gold-dark" aria-hidden />
          </span>
        }
      />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-extrabold tracking-tight text-foreground">Installers</h2>
          <p className="text-sm text-muted-foreground">
            The enforcement agent for each supported platform. The macOS package is an unsigned
            preview build — right-click the .pkg and choose Open to get past Gatekeeper.
          </p>
        </div>
        <InstallersGrid
          installers={installers.data?.installers}
          loading={installers.isLoading && !installers.data}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-extrabold tracking-tight text-foreground">
            Agent packages
          </h2>
          <p className="text-sm text-muted-foreground">
            Generated enforcement bundles, zipped per build — download to apply configurations
            manually on hosts without the agent.
          </p>
        </div>
        <BundlesGrid
          bundles={bundles.data?.bundles}
          loading={bundles.isLoading && !bundles.data}
        />
      </section>
    </div>
  )
}
