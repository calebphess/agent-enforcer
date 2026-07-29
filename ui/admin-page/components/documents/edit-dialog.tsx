'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Upload, FileText, X } from 'lucide-react'
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
import {
  updateDocument,
  getUploadUrl,
  uploadFile,
  ApiError,
  type EnforcementDocument,
} from '@/lib/api'

export function EditDialog({
  doc,
  onOpenChange,
  onSaved,
}: {
  doc: EnforcementDocument | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (doc) {
      setName(doc.name)
      setDescription(doc.description)
      setFile(null)
      setBusy(false)
    }
  }, [doc])

  function handleFilePicked(picked: File | undefined | null) {
    if (fileRef.current) fileRef.current.value = ''
    if (!picked) return
    if (!picked.name.toLowerCase().endsWith('.md')) {
      toast.error('Only Markdown (.md) files are supported.')
      return
    }
    setFile(picked)
  }

  async function handleSave() {
    if (!doc || !name.trim()) return
    setBusy(true)
    try {
      await updateDocument(doc.id, { name: name.trim(), description: description.trim() })
      if (file) {
        const { upload_url } = await getUploadUrl(doc.id)
        await uploadFile(upload_url, file)
        toast.success('Document updated — file replaced, regeneration triggered.')
      } else {
        toast.success('Document updated.')
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Update failed.')
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit document</DialogTitle>
          <DialogDescription>
            Update the name, description, or replace the tracked file.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className="h-9"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-desc">Description</Label>
            <Textarea
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              rows={3}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Tracked file</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".md,text/markdown"
              className="hidden"
              onChange={(e) => handleFilePicked(e.target.files?.[0])}
            />
            {file ? (
              <div className="flex items-center gap-2 rounded-md border border-line bg-soft px-3 py-2">
                <FileText className="size-4 shrink-0 text-gold-dark" />
                <span className="flex-1 truncate font-mono text-xs text-ink">{file.name}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setFile(null)}
                  disabled={busy}
                  aria-label="Remove selected file"
                >
                  <X />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="justify-start"
              >
                <Upload data-icon="inline-start" />
                Replace file
              </Button>
            )}
            {doc && (
              <p className="text-xs text-muted-foreground">
                Current: <span className="font-mono">{doc.filename}</span> · version{' '}
                {doc._version}
                {file && ' · uploading a new file triggers regeneration'}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={busy} />}>Cancel</DialogClose>
          <Button onClick={handleSave} disabled={!name.trim() || busy}>
            {busy && <Loader2 className="animate-spin" data-icon="inline-start" />}
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
