'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'
import type { Board } from '@/lib/board'
import { addDays, nextMonth, prevMonth } from '@/lib/dates'
import type { View } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Awards } from './awards'
import { Rankings } from './rankings'
import { TeamBattle } from './team-battle'

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Failed to load')
    return r.json() as Promise<Board>
  })

export function LiveBoard() {
  const [view, setView] = useState<View>('month')
  const [date, setDate] = useState<string | null>(null)
  const key = `/api/board?view=${view}${date ? `&date=${date}` : ''}`
  const { data, error, isLoading } = useSWR<Board>(key, fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  })

  const step = (dir: 1 | -1) => {
    if (!data) return
    if (view === 'week') setDate(addDays(data.friday, dir * 7))
    else setDate(`${dir === 1 ? nextMonth(data.month) : prevMonth(data.month)}-15`)
  }

  const atStart = !!data && (view === 'week' ? addDays(data.friday, -7) < data.startDate : data.month <= data.startDate.slice(0, 7))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
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
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={atStart || !data}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
            aria-label={`Previous ${view}`}
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="text-center">
            <p className="font-display text-2xl font-bold uppercase tracking-wide">
              {data ? (view === 'week' ? data.weekLabel : data.monthLabel) : 'Loading'}
            </p>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              {error
                ? 'Offline — showing last update'
                : data
                  ? `Live · updated ${new Date(data.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                  : 'Connecting'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={!data}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
            aria-label={`Next ${view}`}
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
        {date && (
          <button type="button" onClick={() => setDate(null)} className="self-center text-xs font-medium text-primary underline-offset-4 hover:underline">
            Jump to current {view}
          </button>
        )}
      </div>

      {isLoading && !data ? (
        <div className="flex flex-col gap-3" aria-hidden="true">
          <div className="h-36 animate-pulse rounded-2xl bg-card" />
          <div className="h-64 animate-pulse rounded-2xl bg-card" />
        </div>
      ) : data ? (
        <>
          <TeamBattle board={data} />
          <Awards board={data} />
          <Rankings board={data} />
        </>
      ) : (
        <p className="rounded-2xl bg-card p-6 text-center text-muted-foreground">Could not load the scoreboard.</p>
      )}
    </div>
  )
}
