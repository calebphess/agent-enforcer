'use client'

import { useCallback, useState } from 'react'
import useSWR from 'swr'
import { Server } from 'lucide-react'
import { usePageChrome } from '@/components/app-shell'
import { PageHeading } from '@/components/page-heading'
import { FleetTable } from '@/components/fleet/fleet-table'
import { AgentDetails } from '@/components/fleet/agent-details'
import { DeregisterDialog } from '@/components/fleet/deregister-dialog'
import { getAgents, type Agent } from '@/lib/api'

export default function FleetPage() {
  const { data, isLoading, mutate } = useSWR('agents', getAgents)

  const refresh = useCallback(async () => {
    await mutate()
  }, [mutate])

  usePageChrome('Fleet', refresh)

  const [selected, setSelected] = useState<Agent | null>(null)
  const [deregister, setDeregister] = useState<Agent | null>(null)

  const agents = data?.agents ?? []

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        eyebrow="Registered agents"
        title="Fleet"
        subline="Every enforcement agent that has registered a license. Click an agent to inspect it or release its license."
        icon={
          <span className="flex size-8 items-center justify-center rounded-md bg-gold-tint">
            <Server className="size-5 text-gold-dark" aria-hidden />
          </span>
        }
      />

      <FleetTable
        agents={agents}
        loading={isLoading && !data}
        onSelect={setSelected}
      />

      <AgentDetails
        agent={selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onDeregister={(agent) => {
          setSelected(null)
          setDeregister(agent)
        }}
      />

      <DeregisterDialog
        agent={deregister}
        onOpenChange={(o) => !o && setDeregister(null)}
        onDeregistered={() => void mutate()}
      />
    </div>
  )
}
