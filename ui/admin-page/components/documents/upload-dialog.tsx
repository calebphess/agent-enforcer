'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { UploadCloud, FileText, AlertTriangle, Loader2, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  createDocument,
  getUploadUrl,
  uploadFile,
  ApiError,
  type EnforcementDocument,
} from '@/lib/api'

function stripExt(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

export function UploadDialog({
  open,
  onOpenChange,
  documents,
  onUploaded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  documents: EnforcementDocument[]
  onUploaded: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)

  function reset() {
    setFile(null)
    setName('')
    setDescription('')
    setDragging(false)
    setBusy(false)
    setProgress(null)
    setConflict(null)
  }

  function handleOpenChange(next: boolean) {
    if (busy) return
    if (!next) reset()
    onOpenChange(next)
  }

  function acceptFile(f: File | undefined | null) {
    if (!f) return
    const lower = f.name.toLowerCase()
    if (!lower.endsWith('.md') && !lower.endsWith('.pdf')) {
      toast.error('Only Markdown (.md) and PDF (.pdf) files are supported.')
      return
    }
    setConflict(null)
    setFile(f)
    setName(stripExt(f.name))
  }

  async function doUpload(getUrl: () => Promise<string>) {
    if (!file) return
    setBusy(true)
    setConflict(null)
    setProgress(0)
    try {
      const url = await getUrl()
      await uploadFile(url, file, setProgress)
      toast.success('Document uploaded — regeneration triggered.')
      onUploaded()
      reset()
      onOpenChange(false)
    } catch (err) {
      setProgress(null)
      if (err instanceof ApiError && err.status === 409) {
        setConflict(err.detail ?? 'A document already tracks this filename.')
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Upload failed. Please try again.')
      }
      setBusy(false)
    }
  }

  function handlePrimary() {
    if (!file || !name.trim()) return
    void doUpload(async () => {
      const res = await createDocument({
        name: name.trim(),
        description: description.trim(),
        filename: file.name,
      })
      return res.upload_url
    })
  }

  function handleReplace() {
    if (!file) return
    const existing = documents.find((d) => !d.deleted && d.filename === file.name)
    if (!existing) {
      toast.error('Could not locate the existing document to replace.')
      return
    }
    void doUpload(async () => {
      const res = await getUploadUrl(existing.id)
      return res.upload_url
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload enforcement document</DialogTitle>
          <DialogDescription>
            Upload a Markdown or PDF file. It is compiled into an enforcement bundle
            automatically — large PDFs are distilled to their software-development
            rules first.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Dropzone */}
          <input
            ref={inputRef}
            type="file"
            accept=".md,.pdf,text/markdown,application/pdf"
            className="hidden"
            onChange={(e) => acceptFile(e.target.files?.[0])}
          />

          {!file ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                acceptFile(e.dataTransfer.files?.[0])
              }}
              className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-6 py-10 text-center transition-colors',
                dragging
                  ? 'border-gold bg-gold-tint'
                  : 'border-line bg-soft/50 hover:border-gold/60 hover:bg-soft',
              )}
            >
              <UploadCloud className="size-7 text-gold-dark" aria-hidden />
              <span className="text-sm font-medium text-ink">
                Drag & drop a <span className="font-mono">.md</span> or{' '}
                <span className="font-mono">.pdf</span> file
              </span>
              <span className="text-xs text-muted-foreground">or click to browse</span>
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-md border border-line bg-soft/50 px-3 py-2.5">
              <FileText className="size-5 shrink-0 text-gold-dark" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-mono text-xs text-ink">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              </div>
              {!busy && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setFile(null)
                    setName('')
                    setConflict(null)
                  }}
                  aria-label="Remove file"
                >
                  <X />
                </Button>
              )}
            </div>
          )}

          {file && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="doc-name">Name</Label>
                <Input
                  id="doc-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                  className="h-9"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="doc-desc">
                  Description <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="doc-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={busy}
                  rows={3}
                  placeholder="What this policy covers…"
                />
              </div>
            </>
          )}

          {progress !== null && (
            <div className="flex flex-col gap-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-soft">
                <div
                  className="h-full rounded-full bg-gold transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">Uploading… {progress}%</span>
            </div>
          )}

          {conflict && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-md border border-danger/30 bg-danger/8 px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <p className="text-sm text-danger">{conflict}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReplace}
                className="self-start border-danger/40 text-danger hover:bg-danger/10 hover:text-danger"
              >
                Replace file instead
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={busy} />}>Cancel</DialogClose>
          <Button onClick={handlePrimary} disabled={!file || !name.trim() || busy}>
            {busy && <Loader2 className="animate-spin" data-icon="inline-start" />}
            {busy ? 'Uploading…' : 'Upload & track'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
