'use client'

import { useState } from 'react'
import useSWR from 'swr'
import type { Board, BoardRow } from '@/lib/board'
import { formatPts } from '@/lib/scoring'
import type { View } from '@/lib/types'
import { cn } from '@/lib/utils'

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Failed to load')
    return r.json() as Promise<Board>
  })

// Short "Nov 7" label for a Friday date (YYYY-MM-DD). Noon avoids any
// timezone shift moving the date.
function shortDate(friday: string) {
  return new Date(`${friday}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function average(scores: number[]) {
  if (scores.length === 0) return null
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length
  return Number.isInteger(avg) ? String(avg) : avg.toFixed(1)
}

function signedPts(points: number) {
  return points > 0 ? `+${formatPts(points)} pts` : `${formatPts(points)} pts`
}

// Driving Scores: every truck driver's driving score, for the selected
// period. Driving counts toward points only for truck drivers, so this
// tab lists exactly the people with a truck number. Same This week /
// This month toggle and board data as the Board, so the scores here always
// match the Board's data.
export function DrivingBoard() {
  const [view, setView] = useState<View>('week')
  const { data: board, error, isLoading } = useSWR<Board>(`/api/board?view=${view}`, fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  })

  const period = view === 'week' ? 'week' : 'month'
  const drivers = (board?.rows ?? []).filter((r) => r.truck)
  const sorted = [...drivers].sort((a, b) => {
    const aScore = view === 'week' ? a.driving.week : average(a.driving.weeks.map((w) => w.score))
    const bScore = view === 'week' ? b.driving.week : average(b.driving.weeks.map((w) => w.score))
    const aNum = aScore === null ? -1 : Number(aScore)
    const bNum = bScore === null ? -1 : Number(bScore)
    return bNum - aNum || a.name.localeCompare(b.name)
  })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Driving Scores</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every truck driver&apos;s driving score for this {period}. 96+ is a safe week, 100 is perfect.
        </p>
      </div>
      <div role="tablist" aria-label="Scoring period" className="grid grid-cols-2 rounded-xl bg-secondary p-1">
        {(['week', 'month'] as View[]).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              'rounded-lg py-2 text-sm font-semibold capitalize transition-colors',
              view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            This {v}
          </button>
        ))}
      </div>

      {isLoading && !board ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <div className="h-16 animate-pulse rounded-2xl bg-card" />
          <div className="h-16 animate-pulse rounded-2xl bg-card" />
          <div className="h-16 animate-pulse rounded-2xl bg-card" />
        </div>
      ) : board ? (
        sorted.length === 0 ? (
          <p className="rounded-2xl bg-card p-6 text-center text-muted-foreground">No truck drivers on the roster.</p>
        ) : (
          <ol className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
            {sorted.map((r) => (
              <DrivingRow key={r.id} row={r} view={view} />
            ))}
          </ol>
        )
      ) : (
        <p className="rounded-2xl bg-card p-6 text-center text-muted-foreground">
          {error ? 'Could not load the driving scores.' : 'Loading driving scores…'}
        </p>
      )}
    </div>
  )
}

function DrivingRow({ row: r, view }: { row: BoardRow; view: View }) {
  const team = r.team === 'red' ? 'Team Red' : 'Team Blue'
  if (view === 'week') {
    const score = r.driving.week
    return (
      <li className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {r.name}
            <span className="font-normal text-muted-foreground"> #{r.truck}</span>
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('size-2 rounded-full', r.team === 'red' ? 'bg-team-red' : 'bg-team-blue')} aria-hidden="true" />
            {team} · {signedPts(r.driving.points)}
          </p>
        </div>
        <p
          className={cn(
            'font-display text-2xl font-bold tabular-nums leading-none',
            score === null ? 'text-muted-foreground' : score >= 96 ? 'text-emerald-400' : 'text-destructive',
          )}
        >
          {score ?? '—'}
        </p>
      </li>
    )
  }
  const avg = average(r.driving.weeks.map((w) => w.score))
  return (
    <li className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {r.name}
            <span className="font-normal text-muted-foreground"> #{r.truck}</span>
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('size-2 rounded-full', r.team === 'red' ? 'bg-team-red' : 'bg-team-blue')} aria-hidden="true" />
            {team} · {signedPts(r.driving.points)}
          </p>
        </div>
        <p
          className={cn(
            'font-display text-2xl font-bold tabular-nums leading-none',
            avg === null ? 'text-muted-foreground' : Number(avg) >= 96 ? 'text-emerald-400' : 'text-destructive',
          )}
        >
          {avg ?? '—'}
        </p>
      </div>
      {r.driving.weeks.length > 0 ? (
        <p className="flex flex-wrap gap-1.5">
          {r.driving.weeks.map((w) => (
            <span
              key={w.friday}
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                w.score >= 96 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-destructive/15 text-destructive',
              )}
            >
              {shortDate(w.friday)}: {w.score}
            </span>
          ))}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">No driving score entered this month.</p>
      )}
    </li>
  )
}
