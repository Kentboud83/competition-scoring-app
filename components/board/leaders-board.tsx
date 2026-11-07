'use client'

import { ChevronDown, Crown, Medal } from 'lucide-react'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import type { Board, BoardRow } from '@/lib/board'
import { formatPts } from '@/lib/scoring'
import { isSoundEnabled, playClick } from '@/lib/sound'
import type { View } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Breakdown } from './breakdown'
import { Awards } from './awards'

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Failed to load')
    return r.json() as Promise<Board>
  })

// Haptic feedback, independent of the sound toggle: it still vibrates when
// sound is off, on devices that support it. Same pattern as Rankings.
function vibrate(opening: boolean) {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
    navigator.vibrate(opening ? 15 : 8)
  } catch {
    // No vibration support; the expand/close still works.
  }
}

// Podium places: rank 1 is gold, rank 2 silver, rank 3 bronze. Ranks come
// from the Board itself, so ties are shared exactly like Rankings (two
// techs tied on points both show the same rank, and the next rank skips).
const PLACES = [
  { rank: 1, label: '1st Place', icon: Crown, badge: 'bg-amber-400/20 text-amber-400', ring: 'border-amber-400/40' },
  { rank: 2, label: '2nd Place', icon: Medal, badge: 'bg-zinc-400/20 text-zinc-300', ring: '' },
  { rank: 3, label: '3rd Place', icon: Medal, badge: 'bg-orange-700/20 text-orange-400', ring: '' },
] as const

function LeaderCard({ row, place, teamName, open, onToggle }: { row: BoardRow; place: (typeof PLACES)[number]; teamName: string; open: boolean; onToggle: () => void }) {
  const Icon = place.icon
  return (
    <li className={cn('overflow-hidden rounded-2xl border bg-card', place.ring || 'border-border')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`leader-breakdown-${row.id}`}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', place.badge)} aria-hidden="true">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{place.label}</p>
          <p className={cn('truncate font-semibold', place.rank === 1 && 'text-lg')}>{row.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('size-2 rounded-full', row.team === 'red' ? 'bg-team-red' : 'bg-team-blue')} aria-hidden="true" />
            {teamName} · {row.role === 'tech' ? 'Tech' : 'Asst'}
          </p>
        </div>
        <div className="text-right">
          <p className={cn('font-display font-bold tabular-nums leading-none', place.rank === 1 ? 'text-3xl' : 'text-2xl')}>
            {formatPts(row.points)}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">pts</p>
        </div>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && <Breakdown id={`leader-breakdown-${row.id}`} breakdown={row.breakdown ?? []} points={row.points} />}
    </li>
  )
}

// Leaders: the three award spots (Top Technician, Top Assistant
// Technician, Most Improved) followed by the top 3 technicians overall
// for the selected period, as a podium — 1st on top, 2nd and 3rd below.
// Same This week / This month toggle and board data as the Board, so the
// awards and the top 3 here always match the Board's data. Tapping a
// leader expands the same score breakdown as Rankings, with the same
// click sound and haptic feedback.
export function LeadersBoard() {
  const [view, setView] = useState<View>('month')
  const [openId, setOpenId] = useState<string | null>(null)
  const { data: board, error, isLoading } = useSWR<Board>(`/api/board?view=${view}`, fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  })

  // Close the expanded breakdown when the period changes.
  useEffect(() => {
    setOpenId(null)
  }, [view])

  function handleRowClick(rowId: string, isOpen: boolean) {
    const opening = !isOpen
    // Update the UI first so the row expands immediately; the click sound
    // plays asynchronously and must never delay the expand.
    setOpenId(opening ? rowId : null)
    vibrate(opening)
    if (isSoundEnabled()) void playClick(opening)
  }

  // Top 3 overall: only techs with scores entered, ranked by the Board
  // (shared rank on ties, so a tied rank can hold more than one leader).
  const leaders = board ? board.rows.filter((r) => r.entered && r.rank <= 3) : []
  const byRank = (rank: number) => leaders.filter((r) => r.rank === rank)
  const period = view === 'week' ? 'week' : 'month'

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Leaders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Top 3 technicians for this {period} — same scores as the Board.
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
        <>
          <Awards board={board} />
          {leaders.length === 0 ? (
            <p className="rounded-2xl bg-card p-6 text-center text-muted-foreground">
              No scores entered yet for this {period} — the podium is waiting for its first leaders.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {byRank(1).length > 0 && (
                <ol className="flex flex-col gap-3">
                  {byRank(1).map((row) => (
                    <LeaderCard
                      key={row.id}
                      row={row}
                      place={PLACES[0]}
                      teamName={board.teams.find((t) => t.key === row.team)?.name ?? ''}
                      open={openId === row.id}
                      onToggle={() => handleRowClick(row.id, openId === row.id)}
                    />
                  ))}
                </ol>
              )}
              {(byRank(2).length > 0 || byRank(3).length > 0) && (
                <ol className="grid gap-3 sm:grid-cols-2">
                  {byRank(2).map((row) => (
                    <LeaderCard
                      key={row.id}
                      row={row}
                      place={PLACES[1]}
                      teamName={board.teams.find((t) => t.key === row.team)?.name ?? ''}
                      open={openId === row.id}
                      onToggle={() => handleRowClick(row.id, openId === row.id)}
                    />
                  ))}
                  {byRank(3).map((row) => (
                    <LeaderCard
                      key={row.id}
                      row={row}
                      place={PLACES[2]}
                      teamName={board.teams.find((t) => t.key === row.team)?.name ?? ''}
                      open={openId === row.id}
                      onToggle={() => handleRowClick(row.id, openId === row.id)}
                    />
                  ))}
                </ol>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="rounded-2xl bg-card p-6 text-center text-muted-foreground">
          {error ? 'Could not load the leaders.' : 'Loading leaders…'}
        </p>
      )}
    </div>
  )
}
