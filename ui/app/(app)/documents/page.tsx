'use client'

import { useCallback, useState } from 'react'
import useSWR from 'swr'
import { Upload } from 'lucide-react'
import { usePageChrome } from '@/components/app-shell'
import { PageHeading } from '@/components/page-heading'
import { Button } from '@/components/ui/button'
import { DocumentsTable } from '@/components/documents/documents-table'
import { UploadDialog } from '@/components/documents/upload-dialog'
import { EditDialog } from '@/components/documents/edit-dialog'
import { DeleteDialog } from '@/components/documents/delete-dialog'
import { getDocuments, type EnforcementDocument } from '@/lib/api'

export default function DocumentsPage() {
  const { data, isLoading, mutate } = useSWR('documents', getDocuments)

  const refresh = useCallback(async () => {
    await mutate()
  }, [mutate])

  usePageChrome('Documents', refresh)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [editDoc, setEditDoc] = useState<EnforcementDocument | null>(null)
  const [deleteDoc, setDeleteDoc] = useState<EnforcementDocument | null>(null)

  const documents = data?.documents ?? []

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        eyebrow="Policy source"
        title="Enforcement Documents"
        subline="Uploaded documents are compiled into enforcement bundles automatically."
        action={
          <Button onClick={() => setUploadOpen(true)}>
            <Upload data-icon="inline-start" />
            Upload document
          </Button>
        }
      />

      <DocumentsTable
        documents={documents}
        loading={isLoading && !data}
        onEdit={setEditDoc}
        onDelete={setDeleteDoc}
      />

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        documents={documents}
        onUploaded={() => void mutate()}
      />

      <EditDialog
        doc={editDoc}
        onOpenChange={(o) => !o && setEditDoc(null)}
        onSaved={() => void mutate()}
      />

      <DeleteDialog
        doc={deleteDoc}
        onOpenChange={(o) => !o && setDeleteDoc(null)}
        onDeleted={() => void mutate()}
      />
    </div>
  )
}
