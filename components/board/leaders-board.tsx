'use client'

import { useState } from 'react'
import useSWR from 'swr'
import type { Board } from '@/lib/board'
import type { View } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Awards } from './awards'

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Failed to load')
    return r.json() as Promise<Board>
  })

// Leaders: only the three award spots — Top Technician, Top Assistant
// Technician, and Most Improved — for the selected period. Same This week /
// This month toggle and board data as the Board, so the awards here always
// match the Board's data.
export function LeadersBoard() {
  const [view, setView] = useState<View>('month')
  const { data: board, error, isLoading } = useSWR<Board>(`/api/board?view=${view}`, fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  })

  const period = view === 'week' ? 'week' : 'month'

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Leaders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Top Technician, Top Assistant Technician, and Most Improved for this {period}.
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
        <div className="flex flex-col gap-3" aria-hidden="true">
          <div className="h-24 animate-pulse rounded-2xl bg-card" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-20 animate-pulse rounded-2xl bg-card" />
            <div className="h-20 animate-pulse rounded-2xl bg-card" />
          </div>
        </div>
      ) : board ? (
        <Awards board={board} />
      ) : (
        <p className="rounded-2xl bg-card p-6 text-center text-muted-foreground">
          {error ? 'Could not load the leaders.' : 'Loading leaders…'}
        </p>
      )}
    </div>
  )
}
