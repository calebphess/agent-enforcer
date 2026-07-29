'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { ShieldCheck } from 'lucide-react'
import { usePageChrome } from '@/components/app-shell'
import { PageHeading } from '@/components/page-heading'
import { StatCards } from '@/components/dashboard/stat-cards'
import { getStats, getAgents } from '@/lib/api'

export default function DashboardPage() {
  const stats = useSWR('stats', getStats)
  const agents = useSWR('agents', getAgents)

  const refresh = useCallback(async () => {
    await Promise.all([stats.mutate(), agents.mutate()])
  }, [stats, agents])

  usePageChrome('Dashboard', refresh)

  const loading = (stats.isLoading || agents.isLoading) && !stats.data && !agents.data

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        eyebrow="Enforcement Overview"
        title="Welcome to Agent Enforcer"
        subline="Stop the Slop. Enforce what your AI agents are allowed to do — before they do it."
        icon={
          <span className="flex size-8 items-center justify-center rounded-md bg-gold-tint">
            <ShieldCheck className="size-5 text-gold-dark" aria-hidden />
          </span>
        }
      />

      <StatCards
        stats={stats.data}
        agentCount={agents.data?.count}
        loading={loading}
      />
    </div>
  )
}
