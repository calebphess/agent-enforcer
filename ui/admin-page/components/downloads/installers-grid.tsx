'use client'

import { useMemo, useState } from 'react'
import {
  MaterialReactTable,
  useMaterialReactTable,
  type MRT_ColumnDef,
} from 'material-react-table'
import { Download, HardDriveDownload } from 'lucide-react'
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
import type { InstallerDownload } from '@/lib/api'

const PLATFORM_LABEL: Record<InstallerDownload['platform'], string> = {
  linux: 'Rocky Linux / RHEL 9',
  macos: 'macOS',
}

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
        size: 260,
        grow: true,
        Cell: ({ row }) => (
          <span className="font-mono text-[13px] font-medium text-foreground">
            {row.original.filename}
          </span>
        ),
      },
      {
        id: 'platform',
        accessorFn: (row) => PLATFORM_LABEL[row.platform],
        header: 'Platform',
        size: 180,
        filterVariant: 'select',
        Cell: ({ row }) => (
          <span className="rounded-full bg-soft px-2 py-0.5 font-mono text-xs text-ink">
            {PLATFORM_LABEL[row.original.platform]}
          </span>
        ),
      },
      {
        accessorKey: 'version',
        header: 'Version',
        size: 130,
        Cell: ({ row }) =>
          row.original.latest ? (
            <StatusPill tone="gold">latest</StatusPill>
          ) : (
            <span className="rounded-full bg-soft px-2 py-0.5 font-mono text-xs text-ink">
              {row.original.version}
            </span>
          ),
      },
      {
        id: 'size',
        accessorFn: (row) => row.size,
        header: 'Size',
        size: 100,
        enableColumnFilter: false,
        Cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{formatSize(row.original.size)}</span>
        ),
      },
      {
        accessorKey: 'updated',
        header: 'Updated',
        size: 150,
        enableColumnFilter: false,
        Cell: ({ row }) => <TimeCell iso={row.original.updated} />,
      },
      {
        id: 'download',
        header: '',
        size: 130,
        enableColumnFilter: false,
        enableSorting: false,
        Cell: ({ row }) => (
          <Button asChild variant="outline" size="sm">
            <a href={row.original.url} download>
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

  return <MaterialReactTable table={table} />
}
