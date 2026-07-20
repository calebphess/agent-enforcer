'use client'

import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { relativeTime, shortDate, fullTimestamp } from '@/lib/time'

/** Relative time ("4 m ago") with full ISO timestamp on hover. */
export function TimeCell({ iso, mode = 'relative' }: { iso: string | null; mode?: 'relative' | 'date' }) {
  if (!iso) return <span className="text-muted-foreground">—</span>
  const label = mode === 'relative' ? relativeTime(iso) : shortDate(iso)
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="cursor-default tabular text-ink underline-offset-2 decoration-dotted hover:underline" />}
      >
        {label}
      </TooltipTrigger>
      <TooltipContent>{fullTimestamp(iso)}</TooltipContent>
    </Tooltip>
  )
}

/** Pill status badge — gold tint for positive, danger tint for negative, muted otherwise. */
export function StatusPill({
  tone,
  children,
}: {
  tone: 'gold' | 'danger' | 'muted'
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tone === 'gold' && 'bg-gold-tint text-gold-dark',
        tone === 'danger' && 'bg-danger/12 text-danger',
        tone === 'muted' && 'bg-soft text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          tone === 'gold' && 'bg-gold',
          tone === 'danger' && 'bg-danger',
          tone === 'muted' && 'bg-muted-foreground',
        )}
      />
      {children}
    </span>
  )
}
