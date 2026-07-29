import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageHeading({
  eyebrow,
  title,
  subline,
  icon,
  action,
  className,
}: {
  eyebrow: string
  title: string
  subline?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow">{eyebrow}</span>
        <div className="flex items-center gap-2.5">
          {icon}
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground text-balance">
            {title}
          </h2>
        </div>
        {subline && (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
            {subline}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
