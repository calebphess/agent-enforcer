'use client'

import { useMemo, useState } from 'react'
import {
  MaterialReactTable,
  useMaterialReactTable,
  type MRT_ColumnDef,
} from 'material-react-table'
import { Download, HardDriveDownload } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { useResponsiveColumns } from '@/hooks/use-responsive-columns'
import { StatusPill, TimeCell } from '@/components/data-cells'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty'
import type { InstallerDownload } from '@/lib/api'

const PLATFORM_LABEL: Record<InstallerDownload['platform'], string> = {
  linux: 'Rocky Linux / RHEL 9',
  macos: 'macOS',
}

// Width reserved for the always-visible pair: truncating filename + Download.
const PRIMARY_MIN_WIDTH = 300
// Optional columns ordered highest → lowest priority (last drops first as the
// grid gets thinner). Widths include cell padding so nothing overflows.
const RESPONSIVE_COLUMNS = [
  { key: 'version', minWidth: 140 },
  { key: 'platform', minWidth: 190 },
  { key: 'updated', minWidth: 160 },
  { key: 'size', minWidth: 110 },
]

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function InstallersGrid({
  installers,
  loading,
}: {
  installers?: InstallerDownload[]
  loading: boolean
}) {
  const isMobile = useIsMobile()
  const [showAll, setShowAll] = useState(false)

  // Drop columns based on the width actually available to the grid (not the
  // viewport); filename + Download always stay.
  const { containerRef, columnVisibility } = useResponsiveColumns(
    PRIMARY_MIN_WIDTH,
    RESPONSIVE_COLUMNS,
  )

  const rows = useMemo(() => {
    const all = installers ?? []
    const visible = showAll ? all : all.filter((i) => i.latest)
    return [...visible].sort((a, b) => {
      if (a.latest !== b.latest) return a.latest ? -1 : 1
      return b.version.localeCompare(a.version, undefined, { numeric: true })
    })
  }, [installers, showAll])

  const columns = useMemo<MRT_ColumnDef<InstallerDownload>[]>(
    () => [
      {
        accessorKey: 'filename',
        header: 'Installer',
        size: 180,
        grow: true,
        Cell: ({ row }) => (
          <span
            className="block max-w-full truncate font-mono text-[13px] font-medium text-foreground"
            title={row.original.filename}
          >
            {row.original.filename}
          </span>
        ),
      },
      {
        id: 'platform',
        accessorFn: (row) => PLATFORM_LABEL[row.platform],
        header: 'Platform',
        size: 170,
        filterVariant: 'select',
        Cell: ({ row }) => (
          <span className="whitespace-nowrap rounded-full bg-soft px-2 py-0.5 font-mono text-xs text-ink">
            {PLATFORM_LABEL[row.original.platform]}
          </span>
        ),
      },
      {
        accessorKey: 'version',
        header: 'Version',
        size: 120,
        Cell: ({ row }) =>
          row.original.latest ? (
            <StatusPill tone="gold">latest</StatusPill>
          ) : (
            <span className="whitespace-nowrap rounded-full bg-soft px-2 py-0.5 font-mono text-xs text-ink">
              {row.original.version}
            </span>
          ),
      },
      {
        id: 'size',
        accessorFn: (row) => row.size,
        header: 'Size',
        size: 90,
        enableColumnFilter: false,
        Cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {formatSize(row.original.size)}
          </span>
        ),
      },
      {
        accessorKey: 'updated',
        header: 'Updated',
        size: 140,
        enableColumnFilter: false,
        Cell: ({ row }) => <TimeCell iso={row.original.updated} />,
      },
      {
        id: 'download',
        header: 'Download',
        size: 120,
        grow: false,
        enableColumnFilter: false,
        enableSorting: false,
        enableColumnOrdering: false,
        Cell: ({ row }) => (
          <a
            href={row.original.url}
            download
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            aria-label={`Download ${row.original.filename}`}
          >
            <Download data-icon="inline-start" />
            <span className="hidden sm:inline">Download</span>
          </a>
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
    // Grid layout + a growing primary column lets the table fill its container
    // without overflowing; dropped columns keep the rest on one line.
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
    renderTopToolbarCustomActions: () => (
      <div className="flex items-center gap-2 px-2 py-1">
        <Switch
          id="installers-show-all"
          checked={showAll}
          onCheckedChange={setShowAll}
          aria-label="Show all installer versions"
        />
        <Label htmlFor="installers-show-all" className="text-xs text-muted-foreground">
          Show all versions
        </Label>
      </div>
    ),
    initialState: { density: 'comfortable' },
    state: { isLoading: loading, showProgressBars: loading, columnVisibility },
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
            <HardDriveDownload />
          </EmptyMedia>
          <EmptyTitle>No installers published</EmptyTitle>
          <EmptyDescription>
            Build the RPM (npm run build:rpm) or the macOS pkg (pkg/build-pkg.sh) and upload to
            the installer bucket.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    ),
  })

  return (
    <div ref={containerRef} className="min-w-0">
      <MaterialReactTable table={table} />
    </div>
  )
}
