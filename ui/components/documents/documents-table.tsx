'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  MaterialReactTable,
  useMaterialReactTable,
  type MRT_ColumnDef,
} from 'material-react-table'
import { FileText, Pencil, Trash2, Loader2, Download } from 'lucide-react'
import { DocumentDetails } from '@/components/documents/document-details'
import { StatusPill, TimeCell } from '@/components/data-cells'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { getDownloadUrl, ApiError, type EnforcementDocument } from '@/lib/api'

export function DocumentsTable({
  documents,
  loading,
  onEdit,
  onDelete,
}: {
  documents?: EnforcementDocument[]
  loading: boolean
  onEdit: (doc: EnforcementDocument) => void
  onDelete: (doc: EnforcementDocument) => void
}) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [detailsDoc, setDetailsDoc] = useState<EnforcementDocument | null>(null)

  async function handleDownload(doc: EnforcementDocument) {
    setDownloadingId(doc.id)
    try {
      const { download_url } = await getDownloadUrl(doc.id)
      const a = document.createElement('a')
      a.href = download_url
      a.download = doc.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      if (download_url.startsWith('blob:')) {
        setTimeout(() => URL.revokeObjectURL(download_url), 2000)
      }
      toast.success(`Downloading ${doc.filename}`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Download failed.')
    } finally {
      setDownloadingId(null)
    }
  }

  const columns = useMemo<MRT_ColumnDef<EnforcementDocument>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        size: 200,
        Cell: ({ row }) => (
          <span className="font-semibold text-foreground">{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'description',
        header: 'Description',
        size: 240,
        Cell: ({ cell }) => {
          const v = cell.getValue<string>()
          return (
            <span className="block max-w-[240px] truncate text-muted-foreground" title={v}>
              {v || '—'}
            </span>
          )
        },
      },
      {
        accessorKey: 'filename',
        header: 'Filename',
        size: 210,
        Cell: ({ row }) => (
          <span className="font-mono text-xs text-ink">{row.original.filename}</span>
        ),
      },
      {
        id: 'version',
        accessorFn: (row) => `v${row._version}`,
        header: 'Version',
        size: 110,
        filterVariant: 'multi-select',
        Cell: ({ row }) => (
          <span className="rounded-full bg-soft px-2 py-0.5 font-mono text-xs text-ink">
            v{row.original._version}
          </span>
        ),
      },
      { accessorKey: 'updated_by', header: 'Updated by', size: 150 },
      {
        accessorKey: 'created',
        header: 'Created',
        size: 160,
        enableColumnFilter: false,
        Cell: ({ row }) => <TimeCell iso={row.original.created} mode="date" />,
      },
      {
        accessorKey: 'updated',
        header: 'Updated',
        size: 160,
        enableColumnFilter: false,
        Cell: ({ row }) => <TimeCell iso={row.original.updated} />,
      },
      {
        id: 'status',
        accessorFn: (row) => (row.deleted ? 'Deleted' : 'Tracked'),
        header: 'Status',
        size: 130,
        filterVariant: 'select',
        Cell: ({ row }) =>
          row.original.deleted ? (
            <StatusPill tone="danger">Deleted</StatusPill>
          ) : (
            <StatusPill tone="gold">Tracked</StatusPill>
          ),
      },
    ],
    [],
  )

  const table = useMaterialReactTable({
    columns,
    data: documents ?? [],
    enableColumnOrdering: true,
    enableColumnResizing: true,
    enableGlobalFilter: true,
    enableFacetedValues: true,
    enableRowActions: true,
    positionActionsColumn: 'last',
    positionGlobalFilter: 'left',
    initialState: {
      showGlobalFilter: true,
      density: 'comfortable',
      sorting: [{ id: 'updated', desc: true }],
      // Default to the essentials; users can add the rest via "Show/Hide columns".
      columnVisibility: {
        description: false,
        filename: false,
        updated_by: false,
        created: false,
      },
    },
    state: { isLoading: loading, showProgressBars: loading },
    muiSearchTextFieldProps: {
      placeholder: 'Search documents…',
      variant: 'outlined',
      size: 'small',
      sx: { minWidth: 260 },
    },
    muiTablePaperProps: {
      elevation: 0,
      sx: {
        borderRadius: '8px',
        border: '1px solid',
        borderColor: 'divider',
        borderTopWidth: '3px',
        borderTopColor: '#c8a94a',
        backgroundColor: 'background.paper',
        overflow: 'hidden',
        boxShadow:
          '0 1px 2px rgba(10,22,40,0.04), 0 8px 24px rgba(10,22,40,0.05)',
      },
    },
    muiTableBodyRowProps: ({ row }) => ({
      onClick: () => setDetailsDoc(row.original),
      sx: {
        cursor: 'pointer',
        opacity: row.original.deleted ? 0.55 : 1,
      },
    }),
    displayColumnDefOptions: {
      'mrt-row-actions': {
        header: 'Actions',
        size: 150,
        muiTableHeadCellProps: { align: 'right' },
        muiTableBodyCellProps: { align: 'right' },
      },
    },
    renderRowActions: ({ row }) => {
      const doc = row.original
      const deleted = !!doc.deleted
      const downloading = downloadingId === doc.id
      return (
        <div
          className="flex items-center justify-end gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <RowAction label="Download" onClick={() => handleDownload(doc)} disabled={downloading}>
            {downloading ? <Loader2 className="animate-spin" /> : <Download />}
          </RowAction>
          {!deleted && (
            <>
              <RowAction label="Edit" onClick={() => onEdit(doc)}>
                <Pencil />
              </RowAction>
              <RowAction label="Delete" destructive onClick={() => onDelete(doc)}>
                <Trash2 />
              </RowAction>
            </>
          )}
        </div>
      )
    },
    renderEmptyRowsFallback: () => (
      <Empty className="border-0 py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-gold-tint text-gold-dark">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>No documents found</EmptyTitle>
          <EmptyDescription>
            Upload an enforcement policy or adjust your filters.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    ),
  })

  return (
    <>
      <MaterialReactTable table={table} />

      <DocumentDetails
        doc={detailsDoc}
        onOpenChange={(o) => !o && setDetailsDoc(null)}
        downloading={!!detailsDoc && downloadingId === detailsDoc.id}
        onDownload={handleDownload}
        onEdit={(doc) => {
          setDetailsDoc(null)
          onEdit(doc)
        }}
        onDelete={(doc) => {
          setDetailsDoc(null)
          onDelete(doc)
        }}
      />
    </>
  )
}

function RowAction({
  label,
  children,
  onClick,
  disabled,
  destructive,
}: {
  label: string
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className={cn(
              destructive && 'text-muted-foreground hover:bg-danger/10 hover:text-danger',
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
