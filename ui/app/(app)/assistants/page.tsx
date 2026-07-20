'use client'

import { useCallback, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { usePageChrome } from '@/components/app-shell'
import { PageHeading } from '@/components/page-heading'
import { AssistantCard } from '@/components/assistants/assistant-card'
import { BundleViewer } from '@/components/assistants/bundle-viewer'
import {
  getAssistants,
  updateAssistants,
  ApiError,
  type AssistantKey,
  type AssistantsMap,
} from '@/lib/api'

interface AssistantMeta {
  key: AssistantKey
  name: string
  monogram: string
  description: string
  comingSoon: boolean
}

const ASSISTANTS: AssistantMeta[] = [
  {
    key: 'claude-code',
    name: 'Claude Code',
    monogram: 'CC',
    description: 'Generates .claude/ bundles: CLAUDE.md, settings, skills, commands.',
    comingSoon: false,
  },
  {
    key: 'kiro',
    name: 'Kiro',
    monogram: 'KI',
    description: 'Bundle generation coming soon.',
    comingSoon: true,
  },
  {
    key: 'cursor',
    name: 'Cursor',
    monogram: 'CU',
    description: 'Bundle generation coming soon.',
    comingSoon: true,
  },
  {
    key: 'github-copilot',
    name: 'GitHub Copilot',
    monogram: 'GH',
    description: 'Bundle generation coming soon.',
    comingSoon: true,
  },
]

export default function AssistantsPage() {
  const { data, isLoading, mutate } = useSWR('assistants', getAssistants)

  const refresh = useCallback(async () => {
    await mutate()
  }, [mutate])

  usePageChrome('Assistants', refresh)

  const [pending, setPending] = useState<AssistantKey | null>(null)
  const [bundleKey, setBundleKey] = useState<AssistantKey | null>(null)
  const assistants = data?.assistants

  async function handleToggle(key: AssistantKey, next: boolean) {
    if (!assistants) return
    const meta0 = ASSISTANTS.find((a) => a.key === key)
    if (meta0?.comingSoon) return
    const optimistic: AssistantsMap = { ...assistants, [key]: next }
    setPending(key)
    try {
      await mutate(async () => ({ assistants: (await updateAssistants({ [key]: next })).assistants }), {
        optimisticData: { assistants: optimistic },
        rollbackOnError: true,
        revalidate: false,
      })
      const meta = ASSISTANTS.find((a) => a.key === key)
      toast.success(`${meta?.name} generation ${next ? 'enabled' : 'disabled'}.`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update assistant. Reverted.')
    } finally {
      setPending(null)
    }
  }

  const claudeOff = assistants && assistants['claude-code'] === false

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        eyebrow="Distribution targets"
        title="Coding Assistants"
        subline="Choose which assistants Agent Enforcer generates configuration bundles for."
      />

      {claudeOff && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border-l-[3px] border-l-danger border-y border-r border-y-danger/20 border-r-danger/20 bg-danger/8 px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <p className="text-sm text-danger">
            Claude Code generation is disabled — uploads will not produce new bundles.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ASSISTANTS.map((a) => (
          <AssistantCard
            key={a.key}
            name={a.name}
            monogram={a.monogram}
            description={a.description}
            comingSoon={a.comingSoon}
            enabled={assistants?.[a.key] ?? false}
            loading={isLoading && !data}
            pending={pending === a.key}
            onToggle={(next) => handleToggle(a.key, next)}
            onViewBundle={() => setBundleKey(a.key)}
          />
        ))}
      </div>

      <BundleViewer
        assistant={bundleKey}
        assistantName={ASSISTANTS.find((a) => a.key === bundleKey)?.name}
        onOpenChange={(o) => !o && setBundleKey(null)}
      />
    </div>
  )
}
