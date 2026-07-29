'use client'

import { useMemo } from 'react'
import {
  MaterialReactTable,
  useMaterialReactTable,
  type MRT_ColumnDef,
} from 'material-react-table'
import { Bot } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { useResponsiveColumns } from '@/hooks/use-responsive-columns'
import { StatusPill, TimeCell } from '@/components/data-cells'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty'
import type { Agent } from '@/lib/api'

// Width reserved for the always-visible User ID column.
const PRIMARY_MIN_WIDTH = 260
// Optional columns ordered highest → lowest priority (last drops first as the
// grid gets thinner). Widths include cell padding so nothing overflows.
const RESPONSIVE_COLUMNS = [
  { key: 'status', minWidth: 160 },
  { key: 'agent_type', minWidth: 180 },
  { key: 'agent_version', minWidth: 150 },
  { key: 'created_date', minWidth: 190 },
]
// Last check-in stays opt-in via the column menu on every viewport.
const ALWAYS_HIDDEN = { last_used_date: false }

export function FleetTable({
  agents,
  loading,
  onSelect,
}: {
  agents?: Agent[]
  loading: boolean
  onSelect: (agent: Agent) => void
}) {
  const isMobile = useIsMobile()

  // Drop columns based on the width actually available to the grid (not the
  // viewport), keeping User ID and dropping the rest from lowest priority up as
  // the container narrows. Row actions live in the detail slide-in.
  const { containerRef, columnVisibility } = useResponsiveColumns(
    PRIMARY_MIN_WIDTH,
    RESPONSIVE_COLUMNS,
    ALWAYS_HIDDEN,
  )

  const columns = useMemo<MRT_ColumnDef<Agent>[]>(
    () => [
      {
        accessorKey: 'user_id',
        header: 'User ID',
        size: 220,
        grow: true,
        Cell: ({ row }) => (
          <span className="font-mono text-[13px] font-medium text-foreground">
            {row.original.user_id}
          </span>
        ),
      },
      {
        accessorKey: 'agent_type',
        header: 'Platform',
        size: 130,
        filterVariant: 'multi-select',
        Cell: ({ row }) => (
          <span className="rounded-full bg-soft px-2 py-0.5 font-mono text-xs text-ink">
            {row.original.agent_type}
          </span>
        ),
      },
      {
        id: 'agent_version',
        accessorFn: (row) => `v${row.agent_version}`,
        header: 'Version',
        size: 110,
        filterVariant: 'multi-select',
        Cell: ({ row }) => (
          <span className="rounded-full bg-soft px-2 py-0.5 font-mono text-xs text-ink">
            v{row.original.agent_version}
          </span>
        ),
      },
      {
        accessorKey: 'created_date',
        header: 'Registered',
        size: 150,
        enableColumnFilter: false,
        Cell: ({ row }) => <TimeCell iso={row.original.created_date} mode="date" />,
      },
      {
        accessorKey: 'last_used_date',
        header: 'Last check-in',
        size: 150,
        enableColumnFilter: false,
        Cell: ({ row }) => <TimeCell iso={row.original.last_used_date} />,
      },
      {
        id: 'status',
        accessorFn: (row) => (row.active ? 'Active' : 'Inactive'),
        header: 'Status',
        size: 120,
        filterVariant: 'select',
        Cell: ({ row }) => (
          <StatusPill tone={row.original.active ? 'gold' : 'muted'}>
            {row.original.active ? 'Active' : 'Inactive'}
          </StatusPill>
        ),
      },
    ],
    [],
  )

  const table = useMaterialReactTable({
    columns,
    data: agents ?? [],
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
      sorting: [{ id: 'created_date', desc: true }],
      pagination: { pageIndex: 0, pageSize: 10 },
    },
    state: { isLoading: loading, showProgressBars: loading, columnVisibility },
    muiSearchTextFieldProps: {
      placeholder: 'Search agents…',
      variant: 'outlined',
      size: 'small',
      sx: { minWidth: 260 },
    },
    muiPaginationProps: {
      rowsPerPageOptions: [10, 25, 50],
      showFirstButton: true,
      showLastButton: true,
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
        boxShadow: '0 1px 2px rgba(10,22,40,0.04), 0 8px 24px rgba(10,22,40,0.05)',
      },
    },
    muiTableBodyRowProps: ({ row }) => ({
      onClick: () => onSelect(row.original),
      sx: { cursor: 'pointer' },
    }),
    renderEmptyRowsFallback: () => (
      <Empty className="border-0 py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-gold-tint text-gold-dark">
            <Bot />
          </EmptyMedia>
          <EmptyTitle>No agents found</EmptyTitle>
          <EmptyDescription>
            Install the RPM and run{' '}
            <code className="rounded bg-soft px-1.5 py-0.5 font-mono text-xs text-ink">
              sudo agent-enforcer register
            </code>
            , or adjust your filters.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    ),
  })

  return (
    <div ref={containerRef}>
      <MaterialReactTable table={table} />
    </div>
  )
}
