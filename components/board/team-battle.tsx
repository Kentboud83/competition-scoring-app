'use client'

import { Swords } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Board } from '@/lib/board'
import { formatPts } from '@/lib/scoring'
import { isSoundEnabled, playChime } from '@/lib/sound'
import { cn } from '@/lib/utils'

const LAST_SEEN_KEY = 'last-seen-team-scores'
const SESSION_KEY = 'team-score-change-played'

type TeamKey = 'red' | 'blue'
type LastSeenScores = { red: number; blue: number }

function fmtSigned(n: number) {
  return (n > 0 ? '+' : '') + (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100))
}

// Record every chime attempt on window so it can be observed in tests /
// diagnostics (a headless browser cannot be heard). Harmless in production.
function recordChime(team: TeamKey, gaining: boolean, deferred: boolean) {
  try {
    const w = window as unknown as {
      __teamScoreChimes?: { team: TeamKey; gaining: boolean; deferred: boolean; at: number }[]
    }
    w.__teamScoreChimes = w.__teamScoreChimes ?? []
    w.__teamScoreChimes.push({ team, gaining, deferred, at: Date.now() })
    window.dispatchEvent(new CustomEvent('team-score-chime', { detail: { team, gaining, deferred } }))
  } catch {
    // Diagnostics must never break the Board.
  }
}

// Play a team's 2-note chime as its ticks start, on the shared
// AudioContext (lib/sound). Celebratory (gaining): two quick ascending
// notes, E5 -> A5. Sad (losing): two quick descending notes, C5 -> G4.
// When autoplay is blocked the chime plays on the first tap instead,
// exactly like the opening fanfare. The attempt is recorded on window so
// it can be observed in tests / diagnostics (a headless browser cannot
// be heard); the 'deferred' flag says whether it had to wait for a
// gesture. Any failure is swallowed: sound must never break the Board.
function tryPlayChime(team: TeamKey, gaining: boolean) {
  if (!isSoundEnabled()) return
  void playChime(gaining).then((result) => {
    recordChime(team, gaining, result === 'deferred')
  })
}

export function TeamBattle({ board }: { board: Board }) {
  const [red, blue] = board.teams
  const [displayRed, setDisplayRed] = useState(red.points)
  const [displayBlue, setDisplayBlue] = useState(blue.points)
  const [deltaRed, setDeltaRed] = useState<number | null>(null)
  const [deltaBlue, setDeltaBlue] = useState<number | null>(null)
  const [animatingTeam, setAnimatingTeam] = useState<TeamKey | null>(null)
  const startedRef = useRef(false)
  const animatingRef = useRef<TeamKey | null>(null)
  const latestRef = useRef<LastSeenScores>({ red: red.points, blue: blue.points })
  const timerRef = useRef<number | null>(null)

  // Clear any running tick timer if the Board unmounts.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
    }
  }, [])

  useEffect(() => {
    latestRef.current = { red: red.points, blue: blue.points }

    // Board data refreshed, or the Week/Month view changed, after the first
    // mount: show the new totals straight away, with no re-animation.
    if (startedRef.current) {
      if (!animatingRef.current) {
        setDisplayRed(red.points)
        setDisplayBlue(blue.points)
        setDeltaRed(null)
        setDeltaBlue(null)
        setAnimatingTeam(null)
      }
      return
    }
    startedRef.current = true

    // Last-seen totals from the previous visit, per user/device (localStorage).
    let stored: LastSeenScores | null = null
    try {
      const raw = window.localStorage.getItem(LAST_SEEN_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LastSeenScores>
        if (
          typeof parsed.red === 'number' &&
          Number.isFinite(parsed.red) &&
          typeof parsed.blue === 'number' &&
          Number.isFinite(parsed.blue)
        ) {
          stored = { red: parsed.red, blue: parsed.blue }
        }
      }
    } catch {
      stored = null
    }

    // Save the current totals now, and mark this session as played, so a
    // reload mid-animation can never replay the same change forever.
    try {
      window.localStorage.setItem(LAST_SEEN_KEY, JSON.stringify({ red: red.points, blue: blue.points }))
    } catch {
      // Storage must never break the Board.
    }
    try {
      if (window.sessionStorage.getItem(SESSION_KEY)) {
        // Already played this session (e.g. a remount): no animation.
        setDisplayRed(red.points)
        setDisplayBlue(blue.points)
        return
      }
      window.sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      // Storage must never break the Board.
    }

    if (!stored) return // Very first visit ever: nothing to compare against.
    if (stored.red === red.points && stored.blue === blue.points) return // Unchanged: no animation.
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    } catch {
      // If the media query is unavailable, animate as normal.
    }

    // Tick one team from its stored total to its current total, then call
    // done. 1 point per tick (0.25 for fractional totals), a few points per
    // tick for big changes: about 1-1.5s per team, at most ~3.5s total.
    const runTeam = (team: TeamKey, from: number, to: number, done: () => void) => {
      const delta = Math.round((to - from) * 100) / 100
      if (delta === 0) {
        done()
        return
      }
      const gaining = delta > 0
      const absDelta = Math.abs(delta)
      const stepSize = absDelta > 12 ? Math.ceil(absDelta / 12) : Number.isInteger(absDelta) ? 1 : 0.25
      const ticks = Math.max(1, Math.ceil(absDelta / stepSize))
      const intervalMs = Math.min(400, Math.max(70, Math.round(1200 / ticks)))
      const direction = gaining ? 1 : -1
      const setDisplay = team === 'red' ? setDisplayRed : setDisplayBlue
      const setDelta = team === 'red' ? setDeltaRed : setDeltaBlue
      animatingRef.current = team
      setAnimatingTeam(team)
      setDelta(delta)
      tryPlayChime(team, gaining)
      let current = from
      timerRef.current = window.setInterval(() => {
        let next = Math.round((current + direction * stepSize) * 100) / 100
        if ((direction > 0 && next >= to) || (direction < 0 && next <= to)) next = to
        current = next
        setDisplay(next)
        const remaining = Math.round((to - next) * 100) / 100
        setDelta(remaining === 0 ? null : remaining)
        if (next === to) {
          if (timerRef.current !== null) window.clearInterval(timerRef.current)
          timerRef.current = null
          animatingRef.current = null
          setAnimatingTeam(null)
          setDelta(null)
          done()
        }
      }, intervalMs)
    }

    // Start at the last-seen totals, then animate Red fully, then Blue.
    setDisplayRed(stored.red)
    setDisplayBlue(stored.blue)
    runTeam('red', stored.red, red.points, () => {
      runTeam('blue', stored.blue, blue.points, () => {
        // If the Board refreshed during the animation, end on the latest totals.
        const latest = latestRef.current
        setDisplayRed(latest.red)
        setDisplayBlue(latest.blue)
        setDeltaRed(null)
        setDeltaBlue(null)
      })
    })
  }, [red.points, blue.points])

  // The bar, leader line and leading highlight follow the displayed
  // (ticking) totals during the animation, so they always agree with the
  // bar. Once the animation finishes the displayed totals are the true
  // current totals, so the final Board is unchanged.
  const total = Math.max(displayRed, 0) + Math.max(displayBlue, 0)
  const redPct = total > 0 ? (Math.max(displayRed, 0) / total) * 100 : 50
  const displayLeader: 'red' | 'blue' | 'tie' | null =
    total === 0 ? null : displayRed === displayBlue ? 'tie' : displayRed > displayBlue ? 'red' : 'blue'
  const displayMargin = Math.abs(displayRed - displayBlue)
  const leaderName = displayLeader === 'red' ? red.name : displayLeader === 'blue' ? blue.name : null

  return (
    <section
      aria-labelledby="battle-title"
      data-testid="team-battle"
      data-animating={animatingTeam ?? 'none'}
      className="overflow-hidden rounded-2xl border border-border bg-card"
    >
      <h2 id="battle-title" className="sr-only">
        Team battle
      </h2>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-4">
        <TeamScore
          name={red.name}
          points={displayRed}
          color="red"
          leading={displayLeader === 'red'}
          meta={`${red.techs} techs · ${red.assts} assts`}
          delta={deltaRed}
          deltaTestId="team-score-delta-red"
        />
        <Swords className="size-6 text-muted-foreground" aria-hidden="true" />
        <TeamScore
          name={blue.name}
          points={displayBlue}
          color="blue"
          leading={displayLeader === 'blue'}
          meta={`${blue.techs} techs · ${blue.assts} assts`}
          align="right"
          delta={deltaBlue}
          deltaTestId="team-score-delta-blue"
        />
      </div>
      <div className="flex h-2.5" aria-hidden="true" data-testid="team-battle-bar">
        <div className="bg-team-red transition-all duration-700" style={{ width: `${redPct}%` }} data-testid="team-battle-red-segment" />
        <div className="flex-1 bg-team-blue transition-all duration-700" />
      </div>
      <p className="px-4 py-3 text-center text-sm font-medium">
        {displayLeader === null
          ? 'No scores yet — the battle is about to begin.'
          : displayLeader === 'tie'
            ? 'Dead even! Every point counts.'
            : `${leaderName} leads by ${formatPts(displayMargin)} pt${displayMargin === 1 ? '' : 's'}`}
      </p>
    </section>
  )
}

function TeamScore({
  name,
  points,
  color,
  leading,
  meta,
  align = 'left',
  delta = null,
  deltaTestId,
}: {
  name: string
  points: number
  color: 'red' | 'blue'
  leading: boolean
  meta: string
  align?: 'left' | 'right'
  delta?: number | null
  deltaTestId?: string
}) {
  return (
    <div className={cn('flex flex-col', align === 'right' && 'items-end text-right')}>
      <span className={cn('text-sm font-semibold uppercase tracking-wider', color === 'red' ? 'text-team-red' : 'text-team-blue')}>
        {name}
      </span>
      <div className={cn('flex items-baseline gap-2', align === 'right' && 'justify-end')}>
        <span className={cn('font-display text-5xl font-extrabold tabular-nums leading-none', leading && 'text-primary')}>
          {formatPts(points)}
        </span>
        {delta !== null && delta !== 0 ? (
          <span
            data-testid={deltaTestId}
            aria-live="polite"
            className={cn('text-lg font-bold tabular-nums', delta > 0 ? 'text-emerald-500' : 'text-red-500')}
          >
            {fmtSigned(delta)}
          </span>
        ) : null}
      </div>
      <span className="mt-1 text-xs text-muted-foreground">{meta}</span>
    </div>
  )
}
