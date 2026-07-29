// Relative + absolute timestamp helpers for the admin console.

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diff = Date.now() - then
  const abs = Math.abs(diff)
  const suffix = diff >= 0 ? 'ago' : 'from now'

  const min = 60_000
  const hour = 60 * min
  const day = 24 * hour

  if (abs < 45_000) return 'just now'
  if (abs < hour) return `${Math.round(abs / min)} m ${suffix}`
  if (abs < day) return `${Math.round(abs / hour)} h ${suffix}`
  if (abs < 30 * day) return `${Math.round(abs / day)} d ${suffix}`

  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function shortDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function fullTimestamp(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}
