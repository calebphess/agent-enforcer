'use client'

import { Download, Pencil, Trash2, Loader2 } from 'lucide-react'
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
import { fullTimestamp } from '@/lib/time'
import {
  GENERATABLE_ASSISTANTS,
  type BuildStatus,
  type DocBuildState,
  type EnforcementDocument,
} from '@/lib/api'

const STATE_TONE: Record<DocBuildState, 'gold' | 'danger' | 'muted'> = {
  current: 'gold',
  stale: 'danger',
  missing: 'muted',
}
const STATE_LABEL: Record<DocBuildState, string> = {
  current: 'In latest build',
  stale: 'Changed since last build',
  missing: 'Not included',
}

export function DocumentDetails({
  doc,
  buildStatus,
  onOpenChange,
  onDownload,
  onEdit,
  onDelete,
  downloading,
}: {
  doc: EnforcementDocument | null
  buildStatus?: BuildStatus
  onOpenChange: (open: boolean) => void
  onDownload: (doc: EnforcementDocument) => void
  onEdit: (doc: EnforcementDocument) => void
  onDelete: (doc: EnforcementDocument) => void
  downloading?: boolean
}) {
  const deleted = !!doc?.deleted
  const docStatus = buildStatus?.documents.find((d) => d.filename === doc?.filename)?.status

  return (
    <Sheet open={!!doc} onOpenChange={onOpenChange}>
      <SheetContent className="w-[94%] gap-0 sm:w-full sm:max-w-md">
        {doc && (
          <>
            <SheetHeader className="gap-2 p-6">
              <span className="eyebrow">Document details</span>
              <SheetTitle className="text-xl font-extrabold tracking-tight text-balance">
                {doc.name}
              </SheetTitle>
              <SheetDescription className="text-pretty">
                {doc.description || 'No description provided.'}
              </SheetDescription>
              <div className="mt-1">
                {deleted ? (
                  <StatusPill tone="danger">Deleted</StatusPill>
                ) : (
                  <StatusPill tone="gold">Tracked</StatusPill>
                )}
              </div>
            </SheetHeader>

            <Separator />

            <dl className="flex flex-col gap-4 overflow-y-auto p-6">
              <DetailRow label="Filename">
                <span className="font-mono text-xs text-foreground">{doc.filename}</span>
              </DetailRow>
              <DetailRow label="Version">
                <span className="rounded-full bg-soft px-2 py-0.5 font-mono text-xs text-ink">
                  v{doc._version}
                </span>
              </DetailRow>
              <DetailRow label="Document ID">
                <span className="break-all font-mono text-xs text-muted-foreground">{doc.id}</span>
              </DetailRow>
              <DetailRow label="Created">
                <span className="text-sm text-foreground">{fullTimestamp(doc.created)}</span>
                <span className="text-xs text-muted-foreground">by {doc.created_by}</span>
              </DetailRow>
              <DetailRow label="Last updated">
                <span className="text-sm text-foreground">{fullTimestamp(doc.updated)}</span>
                <span className="text-xs text-muted-foreground">by {doc.updated_by}</span>
              </DetailRow>
              {deleted && (
                <DetailRow label="Deleted">
                  <span className="text-sm text-danger">{fullTimestamp(doc.deleted)}</span>
                </DetailRow>
              )}
              {!deleted && (
                <DetailRow label="Bundle inclusion">
                  {GENERATABLE_ASSISTANTS.map((a) => {
                    const build = buildStatus?.builds?.[a]
                    if (!build) {
                      return (
                        <span key={a} className="text-xs text-muted-foreground">
                          {a}: no build yet
                        </span>
                      )
                    }
                    const state: DocBuildState = docStatus?.[a] ?? 'missing'
                    return (
                      <span key={a} className="flex items-center gap-2">
                        <StatusPill tone={STATE_TONE[state]}>{STATE_LABEL[state]}</StatusPill>
                        <span className="font-mono text-xs text-muted-foreground">
                          {a} v{build.version}
                        </span>
                      </span>
                    )
                  })}
                </DetailRow>
              )}
            </dl>

            <SheetFooter className="gap-2 border-t border-line sm:flex-row">
              <Button
                onClick={() => onDownload(doc)}
                disabled={downloading}
                className="flex-1"
              >
                {downloading ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Download data-icon="inline-start" />
                )}
                Download
              </Button>
              {!deleted && (
                <>
                  <Button variant="outline" onClick={() => onEdit(doc)}>
                    <Pencil data-icon="inline-start" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onDelete(doc)}
                    className="text-muted-foreground hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 data-icon="inline-start" />
                    Delete
                  </Button>
                </>
              )}
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
