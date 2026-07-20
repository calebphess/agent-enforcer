'use client'

import { useMemo } from 'react'
import {
  MaterialReactTable,
  useMaterialReactTable,
  type MRT_ColumnDef,
} from 'material-react-table'
import { Bot, ShieldOff } from 'lucide-react'
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
import type { Agent } from '@/lib/api'

export function FleetTable({
  agents,
  loading,
  onSelect,
  onDeregister,
}: {
  agents?: Agent[]
  loading: boolean
  onSelect: (agent: Agent) => void
  onDeregister: (agent: Agent) => void
}) {
  const columns = useMemo<MRT_ColumnDef<Agent>[]>(
    () => [
      {
        accessorKey: 'user_id',
        header: 'User ID',
        size: 220,
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
      sorting: [{ id: 'created_date', desc: true }],
      pagination: { pageIndex: 0, pageSize: 10 },
      // Default to the essentials; "Last check-in" can be added via "Show/Hide columns".
      columnVisibility: {
        last_used_date: false,
      },
    },
    state: { isLoading: loading, showProgressBars: loading },
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
    displayColumnDefOptions: {
      'mrt-row-actions': {
        header: 'Actions',
        size: 120,
        muiTableHeadCellProps: { align: 'right' },
        muiTableBodyCellProps: { align: 'right' },
      },
    },
    renderRowActions: ({ row }) => (
      <div
        className="flex items-center justify-end"
        onClick={(e) => e.stopPropagation()}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onDeregister(row.original)}
                aria-label="De-register agent"
                className="text-muted-foreground hover:bg-danger/10 hover:text-danger"
              />
            }
          >
            <ShieldOff />
          </TooltipTrigger>
          <TooltipContent>De-register</TooltipContent>
        </Tooltip>
      </div>
    ),
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

  return <MaterialReactTable table={table} />
}
