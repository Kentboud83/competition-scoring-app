'use client'

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Board, BreakdownLine } from '@/lib/board'
import { formatPts } from '@/lib/scoring'
import type { Role } from '@/lib/types'
import { cn } from '@/lib/utils'

const filters: { key: 'all' | Role; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'tech', label: 'Techs' },
  { key: 'asst', label: 'Assistants' },
]

function fmtNum(n: number) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

function fmtSigned(n: number) {
  return (n > 0 ? '+' : '') + fmtNum(n)
}

// Short detail under a breakdown line, e.g. "6 × +1" for jobs or
// "1 safe week" for driving. The points for the line are shown at the right.
function lineDetail(line: BreakdownLine) {
  if (line.key === 'driving') return line.detail ?? ''
  if (line.rate === 1) return fmtNum(line.raw)
  return `${fmtNum(line.raw)} × ${fmtSigned(line.rate ?? 0)}`
}

export function Rankings({ board }: { board: Board }) {
  const [filter, setFilter] = useState<'all' | Role>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const rows = filter === 'all' ? board.rows : rankWithin(board.rows.filter((r) => r.role === filter))

  // Close the expanded breakdown when the period or view changes, so a
  // breakdown from one view is never shown under another view's rows.
  // The breakdown itself always comes from the current board data, so an
  // open row always matches the rows shown.
  useEffect(() => {
    setOpenId(null)
  }, [board.view, board.friday, board.month])

  return (
    <section aria-labelledby="rankings-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="rankings-title" className="font-display text-xl font-bold uppercase tracking-wide">
          Rankings
        </h2>
        <div className="flex gap-1" role="group" aria-label="Filter rankings">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                filter === f.key ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <ol className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map((r) => {
          const open = openId === r.id
          const breakdown = r.breakdown ?? []
          return (
            <li key={r.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`breakdown-${r.id}`}
                onClick={() => setOpenId(open ? null : r.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full font-display text-lg font-bold tabular-nums',
                    r.rank === 1 && r.entered ? 'bg-primary text-primary-foreground' : r.rank <= 3 && r.entered ? 'bg-secondary text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <span className="sr-only">Rank</span>
                  {r.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn('size-2 rounded-full', r.team === 'red' ? 'bg-team-red' : 'bg-team-blue')} aria-hidden="true" />
                    {board.teams.find((t) => t.key === r.team)?.name} · {r.role === 'tech' ? 'Tech' : 'Asst'}
                    {r.behind > 0 && r.entered && <span>· {formatPts(r.behind)} back</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn('font-display text-2xl font-bold tabular-nums leading-none', !r.entered && 'text-muted-foreground')}>
                    {r.entered ? formatPts(r.points) : '—'}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">pts</p>
                </div>
                <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
              </button>
              {open && (
                <div id={`breakdown-${r.id}`} className="border-t border-border bg-muted/40 px-4 py-3">
                  {breakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No scores entered yet for this period.</p>
                  ) : (
                    <>
                      <ul className="flex flex-col">
                        {breakdown.map((line) => (
                          <li key={line.key} className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{line.label}</p>
                              <p className="text-xs text-muted-foreground">{lineDetail(line)}</p>
                            </div>
                            <p className={cn('shrink-0 font-display text-base font-bold tabular-nums', line.points < 0 ? 'text-destructive' : 'text-foreground')}>
                              {formatPts(line.points)} pts
                            </p>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                        <p className="text-sm font-bold">Total</p>
                        <p className="font-display text-base font-bold tabular-nums">{formatPts(r.points)} pts</p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function rankWithin(rows: Board['rows']) {
  const top = rows[0]?.points ?? 0
  let last = Number.NaN
  let rank = 0
  return rows.map((r, i) => {
    if (r.points !== last) rank = i + 1
    last = r.points
    return { ...r, rank, behind: top - r.points }
  })
}
