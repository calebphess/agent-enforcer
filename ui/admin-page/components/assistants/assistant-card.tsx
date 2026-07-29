'use client'

import { FolderOpen } from 'lucide-react'
import { Panel } from '@/components/panel'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function AssistantCard({
  name,
  monogram,
  description,
  comingSoon,
  enabled,
  loading,
  pending,
  onToggle,
  onViewBundle,
}: {
  name: string
  monogram: string
  description: string
  comingSoon: boolean
  enabled: boolean
  loading: boolean
  pending: boolean
  onToggle: (next: boolean) => void
  onViewBundle?: () => void
}) {
  if (loading) {
    return (
      <Panel className="flex items-start gap-4 p-6">
        <Skeleton className="size-12 rounded-md" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full max-w-xs" />
        </div>
      </Panel>
    )
  }

  return (
    <Panel className={cn('flex flex-col gap-4 p-6', comingSoon && 'opacity-75')}>
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-md text-sm font-extrabold',
            comingSoon ? 'bg-soft text-muted-foreground' : 'bg-navy text-gold',
          )}
        >
          {monogram}
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-extrabold tracking-tight text-foreground">{name}</h3>
            {comingSoon && (
              <span className="rounded-full bg-gold-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gold-dark">
                Coming soon
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {description}
          </p>
        </div>

        <div className="shrink-0 pt-0.5">
          <Switch
            checked={comingSoon ? false : enabled}
            onCheckedChange={onToggle}
            disabled={comingSoon || pending}
            aria-label={
              comingSoon
                ? `${name} generation is coming soon`
                : `${enabled ? 'Disable' : 'Enable'} ${name}`
            }
            className={cn(
              (pending || comingSoon) && 'opacity-60',
              comingSoon && 'cursor-not-allowed',
            )}
          />
        </div>
      </div>

      {!comingSoon && onViewBundle && (
        <div className="flex items-center justify-end border-t border-line pt-4">
          <Button variant="outline" size="sm" onClick={onViewBundle}>
            <FolderOpen data-icon="inline-start" />
            View generated bundle
          </Button>
        </div>
      )}
    </Panel>
  )
}
