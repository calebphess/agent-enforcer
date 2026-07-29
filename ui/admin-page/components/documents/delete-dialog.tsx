'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'
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
import { deleteDocument, ApiError, type EnforcementDocument } from '@/lib/api'

export function DeleteDialog({
  doc,
  onOpenChange,
  onDeleted,
}: {
  doc: EnforcementDocument | null
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    if (!doc) return
    setBusy(true)
    try {
      await deleteDocument(doc.id)
      toast.success('Document deleted — the bundle will regenerate without it.')
      onDeleted()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={!!doc} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-danger/12 text-danger">
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete {doc?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This also removes the file from the enforcement source — the bundle regenerates
            without it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(e) => {
              e.preventDefault()
              void handleDelete()
            }}
            disabled={busy}
          >
            {busy && <Loader2 className="animate-spin" data-icon="inline-start" />}
            {busy ? 'Deleting…' : 'Delete document'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
