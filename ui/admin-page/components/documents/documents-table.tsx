'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  MaterialReactTable,
  useMaterialReactTable,
  type MRT_ColumnDef,
} from 'material-react-table'
import { FileText } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { useResponsiveColumns } from '@/hooks/use-responsive-columns'
import { DocumentDetails } from '@/components/documents/document-details'
import { StatusPill, TimeCell } from '@/components/data-cells'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty'
import { getDownloadUrl, ApiError, type EnforcementDocument } from '@/lib/api'

// Width reserved for the always-visible Name column.
const PRIMARY_MIN_WIDTH = 260
// Optional columns ordered highest → lowest priority (last drops first as the
// grid gets thinner). Widths include cell padding so nothing overflows.
const RESPONSIVE_COLUMNS = [
  { key: 'status', minWidth: 170 },
  { key: 'version', minWidth: 150 },
  { key: 'updated', minWidth: 200 },
]
// Columns hidden by default; users can re-enable them via the column menu.
const ALWAYS_HIDDEN = {
  description: false,
  filename: false,
  updated_by: false,
  created: false,
}

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
  const isMobile = useIsMobile()

  // Drop columns based on the width actually available to the grid (not the
  // viewport), keeping Name and dropping the rest from lowest priority up as
  // the container narrows. Row actions live in the detail slide-in.
  const { containerRef, columnVisibility } = useResponsiveColumns(
    PRIMARY_MIN_WIDTH,
    RESPONSIVE_COLUMNS,
    ALWAYS_HIDDEN,
  )

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
        grow: true,
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
    // On mobile, drop column drag-to-reorder plus the density and
    // show/hide-filters toolbar buttons to reclaim space.
    enableColumnOrdering: !isMobile,
    enableColumnResizing: true,
    enableGlobalFilter: true,
    enableColumnFilters: !isMobile,
    enableFacetedValues: true,
    enableDensityToggle: !isMobile,
    enableRowActions: false,
    positionGlobalFilter: 'left',
    // Grid layout + a growing primary column lets the table fill its container
    // instead of leaving dead space, and keeps header labels from truncating.
    layoutMode: 'grid',
    muiTableHeadCellProps: {
      sx: {
        '& .Mui-TableHeadCell-Content': { overflow: 'visible' },
        '& .Mui-TableHeadCell-Content-Labels': { overflow: 'visible' },
        '& .Mui-TableHeadCell-Content-Wrapper': {
          overflow: 'visible',
          textOverflow: 'clip',
          whiteSpace: 'nowrap',
        },
      },
    },
    initialState: {
      showGlobalFilter: true,
      density: 'comfortable',
      sorting: [{ id: 'updated', desc: true }],
    },
    state: { isLoading: loading, showProgressBars: loading, columnVisibility },
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
      <div ref={containerRef}>
        <MaterialReactTable table={table} />
      </div>

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


