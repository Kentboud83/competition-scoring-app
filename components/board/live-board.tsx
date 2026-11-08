'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { memo, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { recordView } from '@/app/actions'
import type { Board } from '@/lib/board'
import { addDays, nextMonth, prevMonth } from '@/lib/dates'
import type { View } from '@/lib/types'
import { cn } from '@/lib/utils'
import { JobsProgress } from './awards'
import { OpeningCelebration } from './opening-celebration'
import { Rankings } from './rankings'
import { TeamBattle } from './team-battle'

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Failed to load')
    return r.json() as Promise<Board>
  })

// The Board's renderable content, minus its updatedAt stamp. updatedAt
// alone can't tell "unchanged": it also moves when another session merely
// opens the app (the view counter bumps it), so a poll would look new
// even when no score, rule or setting changed. Everything the Board
// renders derives from the store + view + date, so this fingerprint
// catches every real change and nothing else. It is small (a few KB) and
// cheap to compute once per poll.
function boardFingerprint(board: Board): string {
  return JSON.stringify({ ...board, updatedAt: '' })
}

// Memoized Board sections: they render purely from the board prop, so
// when the applied board is unchanged they skip re-rendering entirely —
// even when LiveBoard itself re-renders around an SWR poll (isValidating
// toggles) or a Week/Month tap. Their internal state (Rankings' open row
// and sound toggle, TeamBattle's catch-up animation) is preserved.
const MemoTeamBattle = memo(TeamBattle)
const MemoJobsProgress = memo(JobsProgress)
const MemoRankings = memo(Rankings)

export function LiveBoard() {
  const [view, setView] = useState<View>('month')
  const [date, setDate] = useState<string | null>(null)
  const key = `/api/board?view=${view}${date ? `&date=${date}` : ''}`
  const { data: fetched, error, isLoading } = useSWR<Board>(key, fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  })

  // The Board the sections actually render. A poll (every 10s, or on
  // focus) only replaces it when the fetched payload's content really
  // changed, so an unchanged poll never re-renders TeamBattle, the jobs
  // progress or Rankings — the fingerprint check above plus the memoized
  // sections below make the poll a no-op for the UI. The poll itself is unchanged:
  // still every 10s, still revalidating on focus, still live when scores
  // move. A Week/Month/date change produces a different fingerprint, so
  // it always applies.
  const [board, setBoard] = useState<Board | null>(null)
  const boardFingerprintRef = useRef<string | null>(null)
  useEffect(() => {
    if (!fetched) return
    const fingerprint = boardFingerprint(fetched)
    if (boardFingerprintRef.current === fingerprint) return
    boardFingerprintRef.current = fingerprint
    setBoard(fetched)
  }, [fetched])

  // Count one view per browser session when the Board first mounts.
  // sessionStorage is per tab, so in-app tab switches, Board polls/refreshes
  // and same-session reloads do not add extra counts; a fresh tab counts again.
  // A session opened with ?nocount=1 (used for the assistant's own checks)
  // is never counted: the flag is stored in sessionStorage, so navigating
  // within the app during that session (Board → Leaders → Board) still
  // doesn't count even once the param is no longer in the URL. The param is
  // read from window.location.search here instead of useSearchParams: this
  // page is statically rendered with no Suspense boundary, and
  // useSearchParams would fail the build without one.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('view-recorded')) return
      if (sessionStorage.getItem('view-nocount')) return
      if (new URLSearchParams(window.location.search).get('nocount') === '1') {
        sessionStorage.setItem('view-nocount', '1')
        return
      }
      sessionStorage.setItem('view-recorded', '1')
      recordView().catch(() => {})
    } catch {
      // A failed count must never break the Board load.
    }
  }, [])

  const step = (dir: 1 | -1) => {
    if (!board) return
    if (view === 'week') setDate(addDays(board.friday, dir * 7))
    else setDate(`${dir === 1 ? nextMonth(board.month) : prevMonth(board.month)}-15`)
  }

  const atStart = !!board && (view === 'week' ? addDays(board.friday, -7) < board.startDate : board.month <= board.startDate.slice(0, 7))

  return (
    <div className="flex flex-col gap-5">
      <OpeningCelebration />
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
            disabled={atStart || !board}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
            aria-label={`Previous ${view}`}
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="text-center">
            <p className="font-display text-2xl font-bold uppercase tracking-wide">
              {board ? (view === 'week' ? board.weekLabel : board.monthLabel) : 'Loading'}
            </p>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              {error
                ? 'Offline — showing last update'
                : board
                  ? `Live · updated ${new Date(board.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                  : 'Connecting'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={!board}
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

      {isLoading && !board ? (
        <div className="flex flex-col gap-3" aria-hidden="true">
          <div className="h-36 animate-pulse rounded-2xl bg-card" />
          <div className="h-64 animate-pulse rounded-2xl bg-card" />
        </div>
      ) : board ? (
        <>
          <MemoTeamBattle board={board} />
          <MemoJobsProgress board={board} />
          <MemoRankings board={board} />
        </>
      ) : (
        <p className="rounded-2xl bg-card p-6 text-center text-muted-foreground">Could not load the scoreboard.</p>
      )}
    </div>
  )
}
