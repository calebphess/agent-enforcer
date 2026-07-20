'use client'

import type { ComponentType } from 'react'
import { useEffect, useState } from 'react'
import { Bot, FileText, Wand2 } from 'lucide-react'
import { Panel } from '@/components/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Stats } from '@/lib/api'

/** Hover-float treatment shared by every dashboard panel (see globals.css). */
const FLOAT = 'panel-float'

export function StatCards({
  stats,
  agentCount,
  loading,
}: {
  stats?: Stats
  agentCount?: number
  loading: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <LicenseCard stats={stats} loading={loading} />
      <StatCard
        icon={Bot}
        label="Registered agents"
        value={agentCount}
        caption="across the fleet"
        loading={loading}
      />
      <StatCard
        icon={FileText}
        label="Enforcement documents"
        value={stats?.documents}
        caption="tracked policy sources"
        loading={loading}
      />
      <StatCard
        icon={Wand2}
        label="Assistants enforcing"
        value={stats ? `${stats.assistants_enabled} of 4` : undefined}
        caption="distribution targets"
        loading={loading}
      />
    </div>
  )
}

function LicenseCard({ stats, loading }: { stats?: Stats; loading: boolean }) {
  const active = stats?.active_licenses ?? 0
  const max = stats?.max_licenses ?? 0
  const pct = max > 0 ? Math.min(100, Math.round((active / max) * 100)) : 0
  const nearLimit = pct >= 90

  // Animate the bar from 0 → pct once data is available.
  const [drawn, setDrawn] = useState(0)
  useEffect(() => {
    if (loading) {
      setDrawn(0)
      return
    }
    const t = requestAnimationFrame(() => setDrawn(pct))
    return () => cancelAnimationFrame(t)
  }, [loading, pct])

  return (
    <Panel className={cn('flex flex-col gap-4 p-6 sm:col-span-2', FLOAT)}>
      <div className="flex items-center justify-between">
        <span className="eyebrow">License usage</span>
        <span className="text-xs font-medium text-muted-foreground">
          {loading ? '' : `${pct}% allocated`}
        </span>
      </div>

      {loading ? (
        <Skeleton className="h-14 w-40" />
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="tabular text-5xl font-extrabold leading-none text-foreground">{active}</span>
          <span className="text-lg font-medium text-muted-foreground">of {max}</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="h-2 w-full overflow-hidden rounded-full bg-soft">
          {!loading && (
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-1000 ease-out',
                nearLimit ? 'bg-danger' : 'bg-gold',
              )}
              style={{ width: `${drawn}%` }}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          active licenses in use
          {nearLimit && (
            <span className="ml-1.5 font-semibold text-danger">· approaching limit</span>
          )}
        </p>
      </div>
    </Panel>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  caption,
  loading,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value?: number | string
  caption: string
  loading: boolean
}) {
  return (
    <Panel className={cn('flex flex-col gap-4 p-6', FLOAT)}>
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <div className="flex size-8 items-center justify-center rounded-md bg-gold-tint">
          <Icon className="size-4 text-gold-dark" />
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-11 w-20" />
      ) : (
        <span className="tabular text-4xl font-extrabold leading-none text-foreground">
          {value ?? '—'}
        </span>
      )}
      <p className="text-xs text-muted-foreground">{caption}</p>
    </Panel>
  )
}
