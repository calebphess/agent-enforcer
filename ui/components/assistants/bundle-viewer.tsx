'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { FileText, FolderOpen, AlertTriangle } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Markdown } from '@/components/markdown'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { listBundleFiles, getBundleFile, type AssistantKey } from '@/lib/api'

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function BundleViewer({
  assistant,
  assistantName,
  onOpenChange,
}: {
  assistant: AssistantKey | null
  assistantName?: string
  onOpenChange: (open: boolean) => void
}) {
  const open = !!assistant

  const { data, isLoading } = useSWR(
    assistant ? ['bundle', assistant] : null,
    () => listBundleFiles(assistant as AssistantKey),
  )
  const files = data?.files ?? []

  const [selected, setSelected] = useState<string | null>(null)

  // Auto-select the first file whenever the bundle list changes.
  useEffect(() => {
    if (files.length > 0) setSelected((cur) => cur ?? files[0].path)
  }, [files])

  // Reset selection when the viewer closes.
  useEffect(() => {
    if (!open) setSelected(null)
  }, [open])

  const { data: fileData, isLoading: fileLoading } = useSWR(
    assistant && selected ? ['bundle-file', assistant, selected] : null,
    () => getBundleFile(assistant as AssistantKey, selected as string),
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 data-[side=right]:w-[92vw] data-[side=right]:sm:max-w-none lg:data-[side=right]:w-[75vw] 2xl:data-[side=right]:w-[1150px]">
        <SheetHeader className="gap-1 border-b border-line p-6">
          <span className="eyebrow">Generated bundle</span>
          <SheetTitle className="text-xl font-extrabold tracking-tight">
            {assistantName ?? 'Bundle'}
          </SheetTitle>
          <SheetDescription>
            Files generated in this assistant&apos;s S3 bundle folder.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* File list */}
          <div className="flex shrink-0 flex-col gap-1 overflow-y-auto border-b border-line p-3 sm:w-72 sm:border-b-0 sm:border-r">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))
            ) : files.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                No files generated yet.
              </p>
            ) : (
              files.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => setSelected(f.path)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                    'hover:bg-gold-tint',
                    selected === f.path
                      ? 'bg-gold-tint font-semibold text-gold-dark'
                      : 'text-muted-foreground',
                  )}
                >
                  <FileText className="size-4 shrink-0" aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate font-mono text-xs" title={f.path}>
                      {f.path}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatSize(f.size)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>

          {/* File content */}
          <div className="flex min-h-0 flex-1 flex-col">
            {files.length === 0 && !isLoading ? (
              <Empty className="border-0 py-14">
                <EmptyHeader>
                  <EmptyMedia variant="icon" className="bg-gold-tint text-gold-dark">
                    <FolderOpen />
                  </EmptyMedia>
                  <EmptyTitle>Bundle is empty</EmptyTitle>
                  <EmptyDescription>
                    No bundle has been generated for this assistant yet. Upload a
                    document to trigger a build.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                {selected && (
                  <div className="flex items-center gap-2 border-b border-line px-6 py-3">
                    <FileText className="size-4 text-gold-dark" aria-hidden />
                    <span className="font-mono text-sm font-medium text-foreground">
                      {selected}
                    </span>
                  </div>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                  {fileLoading ? (
                    <div className="flex flex-col gap-3">
                      <Skeleton className="h-6 w-1/2" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : fileData ? (
                    <div className="max-w-3xl">
                      <Markdown>{fileData.content}</Markdown>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="size-4" aria-hidden />
                      Could not load this file.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
