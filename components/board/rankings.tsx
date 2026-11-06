'use client'

import { useState } from 'react'
import type { Board } from '@/lib/board'
import { formatPts } from '@/lib/scoring'
import type { Role } from '@/lib/types'
import { cn } from '@/lib/utils'

const filters: { key: 'all' | Role; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'tech', label: 'Techs' },
  { key: 'asst', label: 'Assistants' },
]

export function Rankings({ board }: { board: Board }) {
  const [filter, setFilter] = useState<'all' | Role>('all')
  const rows = filter === 'all' ? board.rows : rankWithin(board.rows.filter((r) => r.role === filter))

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
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
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
          </li>
        ))}
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
