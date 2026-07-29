import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Signature surface: gold top accent border, hairline sides/bottom, soft lift. */
export function Panel({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-md border-x border-b border-t-[3px] border-x-line border-b-line border-t-gold bg-card',
        'shadow-[0_1px_2px_rgba(10,22,40,0.04),0_8px_24px_rgba(10,22,40,0.05)]',
        className,
      )}
      {...props}
    />
  )
}

export function PanelHeader({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow: string
  title: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-b border-line px-5 py-4',
        className,
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span className="eyebrow">{eyebrow}</span>
        <h3 className="text-base font-extrabold tracking-tight text-foreground">{title}</h3>
      </div>
      {action}
    </div>
  )
}
