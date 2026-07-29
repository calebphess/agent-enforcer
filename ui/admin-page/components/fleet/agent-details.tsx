'use client'

import { ShieldOff } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { StatusPill } from '@/components/data-cells'
import { fullTimestamp, relativeTime } from '@/lib/time'
import type { Agent } from '@/lib/api'

export function AgentDetails({
  agent,
  onOpenChange,
  onDeregister,
}: {
  agent: Agent | null
  onOpenChange: (open: boolean) => void
  onDeregister: (agent: Agent) => void
}) {
  return (
    <Sheet open={!!agent} onOpenChange={onOpenChange}>
      <SheetContent className="w-[94%] gap-0 sm:w-full sm:max-w-md">
        {agent && (
          <>
            <SheetHeader className="gap-2 p-6">
              <span className="eyebrow">Agent details</span>
              <SheetTitle className="break-all font-mono text-xl font-extrabold tracking-tight">
                {agent.user_id}
              </SheetTitle>
              <SheetDescription>
                Registered enforcement agent on the fleet.
              </SheetDescription>
              <div className="mt-1">
                <StatusPill tone={agent.active ? 'gold' : 'muted'}>
                  {agent.active ? 'Active' : 'Inactive'}
                </StatusPill>
              </div>
            </SheetHeader>

            <Separator />

            <dl className="flex flex-col gap-4 overflow-y-auto p-6">
              <DetailRow label="Agent ID">
                <span className="font-mono text-xs text-foreground">#{agent.id}</span>
              </DetailRow>
              <DetailRow label="Platform">
                <span className="rounded-full bg-soft px-2 py-0.5 font-mono text-xs text-ink">
                  {agent.agent_type}
                </span>
              </DetailRow>
              <DetailRow label="Agent version">
                <span className="rounded-full bg-soft px-2 py-0.5 font-mono text-xs text-ink">
                  v{agent.agent_version}
                </span>
              </DetailRow>
              <DetailRow label="Registered">
                <span className="text-sm text-foreground">{fullTimestamp(agent.created_date)}</span>
              </DetailRow>
              <DetailRow label="Last check-in">
                <span className="text-sm text-foreground">{fullTimestamp(agent.last_used_date)}</span>
                <span className="text-xs text-muted-foreground">
                  {relativeTime(agent.last_used_date)}
                </span>
              </DetailRow>
              <DetailRow label="Enforced config versions">
                {Object.keys(agent.applied_versions ?? {}).length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Not reported yet — populated after the agent&apos;s next sync.
                  </span>
                ) : (
                  Object.entries(agent.applied_versions ?? {}).map(([name, version]) => (
                    <span key={name} className="flex items-center gap-2">
                      <span className="rounded-full bg-soft px-2 py-0.5 font-mono text-xs text-ink">
                        {name}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {version || 'unknown'}
                      </span>
                    </span>
                  ))
                )}
              </DetailRow>
            </dl>

            <SheetFooter className="gap-2 border-t border-line">
              <Button
                variant="destructive"
                onClick={() => onDeregister(agent)}
                className="w-full"
              >
                <ShieldOff data-icon="inline-start" />
                De-register agent
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Releases the license and removes this agent from the fleet.
              </p>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="flex flex-col gap-0.5">{children}</dd>
    </div>
  )
}
