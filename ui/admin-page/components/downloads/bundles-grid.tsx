'use client'

import { useMemo, useState } from 'react'
import {
  MaterialReactTable,
  useMaterialReactTable,
  type MRT_ColumnDef,
} from 'material-react-table'
import { Download, PackageOpen } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { StatusPill, TimeCell } from '@/components/data-cells'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty'
import type { BundleDownload } from '@/lib/api'

export function BundlesGrid({
  bundles,
  loading,
}: {
  bundles?: BundleDownload[]
  loading: boolean
}) {
  const isMobile = useIsMobile()
  const [showAll, setShowAll] = useState(false)

  const rows = useMemo(() => {
    const all = bundles ?? []
    const visible = showAll ? all : all.filter((b) => b.latest)
    // Newest first across assistants; version is epoch millis so string
    // compare with numeric collation is chronological
    return [...visible].sort((a, b) =>
      b.version.localeCompare(a.version, undefined, { numeric: true }),
    )
  }, [bundles, showAll])

  const columns = useMemo<MRT_ColumnDef<BundleDownload>[]>(
    () => [
      {
        accessorKey: 'filename',
        header: 'Agent package',
        size: 280,
        grow: true,
        Cell: ({ row }) => (
          <span className="font-mono text-[13px] font-medium text-foreground">
            {row.original.filename}
          </span>
        ),
      },
      {
        accessorKey: 'assistant',
        header: 'Assistant',
        size: 150,
        filterVariant: 'select',
        Cell: ({ row }) => (
          <span className="rounded-full bg-soft px-2 py-0.5 font-mono text-xs text-ink">
            {row.original.assistant}
          </span>
        ),
      },
      {
        accessorKey: 'version',
        header: 'Version',
        size: 170,
        Cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs text-ink">{row.original.version}</span>
            {row.original.latest && <StatusPill tone="gold">latest</StatusPill>}
          </span>
        ),
      },
      {
        accessorKey: 'built_at',
        header: 'Built',
        size: 150,
        enableColumnFilter: false,
        Cell: ({ row }) => <TimeCell iso={row.original.built_at} />,
      },
      {
        id: 'download',
        header: '',
        size: 130,
        enableColumnFilter: false,
        enableSorting: false,
        Cell: ({ row }) => (
          <Button asChild variant="outline" size="sm">
            <a href={row.original.zip_url} download={row.original.filename}>
              <Download data-icon="inline-start" />
              Download
            </a>
          </Button>
        ),
      },
    ],
    [],
  )

  const table = useMaterialReactTable({
    columns,
    data: rows,
    enableColumnOrdering: false,
    enableColumnResizing: false,
    enableGlobalFilter: false,
    enableColumnFilters: !isMobile,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableHiding: false,
    enableRowActions: false,
    layoutMode: 'grid',
    renderTopToolbarCustomActions: () => (
      <div className="flex items-center gap-2 px-2 py-1">
        <Switch
          id="bundles-show-all"
          checked={showAll}
          onCheckedChange={setShowAll}
          aria-label="Show all agent package versions"
        />
        <Label htmlFor="bundles-show-all" className="text-xs text-muted-foreground">
          Show all versions
        </Label>
      </div>
    ),
    initialState: { density: 'comfortable' },
    state: { isLoading: loading, showProgressBars: loading },
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
        boxShadow: '0 1px 2px rgba(10,22,40,0.04), 0 8px 24px rgba(10,22,40,0.05)',
      },
    },
    renderEmptyRowsFallback: () => (
      <Empty className="border-0 py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-gold-tint text-gold-dark">
            <PackageOpen />
          </EmptyMedia>
          <EmptyTitle>No agent packages built yet</EmptyTitle>
          <EmptyDescription>
            Upload an enforcement document — every build produces a versioned, downloadable
            package per enabled assistant.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    ),
  })

  return <MaterialReactTable table={table} />
}
