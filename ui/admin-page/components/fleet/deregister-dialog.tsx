'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, ShieldOff } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogMedia,
} from '@/components/ui/alert-dialog'
import { deregisterAgent, ApiError, type Agent } from '@/lib/api'

export function DeregisterDialog({
  agent,
  onOpenChange,
  onDeregistered,
}: {
  agent: Agent | null
  onOpenChange: (open: boolean) => void
  onDeregistered: () => void
}) {
  const [busy, setBusy] = useState(false)

  async function handleDeregister() {
    if (!agent) return
    setBusy(true)
    try {
      await deregisterAgent(agent.id)
      toast.success(`Agent de-registered — license released.`)
      onDeregistered()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'De-registration failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={!!agent} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-danger/12 text-danger">
            <ShieldOff />
          </AlertDialogMedia>
          <AlertDialogTitle>De-register this agent?</AlertDialogTitle>
          <AlertDialogDescription>
            This releases the license held by{' '}
            <span className="font-mono font-semibold text-foreground">{agent?.user_id}</span>{' '}
            and removes it from the fleet. The agent must re-register to reconnect. This
            can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep agent</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(e) => {
              e.preventDefault()
              void handleDeregister()
            }}
            disabled={busy}
          >
            {busy && <Loader2 className="animate-spin" data-icon="inline-start" />}
            {busy ? 'De-registering…' : 'Yes, de-register'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
