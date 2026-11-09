'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Volume2, VolumeX } from 'lucide-react'
import type { Board } from '@/lib/board'
import { formatPts } from '@/lib/scoring'
import { playClick } from '@/lib/sound'
import type { Role } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Breakdown } from './breakdown'

const SOUND_STORAGE_KEY = 'rankings-sound-on'

const filters: { key: 'all' | Role; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'tech', label: 'Techs' },
  { key: 'asst', label: 'Assistants' },
]

// Haptic feedback, independent of the sound toggle: it still vibrates when
// sound is off, on devices that support it. Guarded so devices/browsers
// without vibration support are unaffected and it never throws.
function vibrate(opening: boolean) {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
    navigator.vibrate(opening ? 15 : 8)
  } catch {
    // No vibration support; the expand/close still works.
  }
}

// First name for alphabetical sorting: the first word of the full name.
function firstName(name: string) {
  return name.split(' ')[0] ?? name
}

// Group rows by team — Team Red first, then Team Blue — with each group
// sorted alphabetically by first name (full name breaks ties). A group
// left empty by the role filter is omitted entirely.
function groupByTeam(rows: Board['rows']) {
  const byTeam = (team: 'red' | 'blue') =>
    rows
      .filter((r) => r.team === team)
      .sort(
        (a, b) =>
          firstName(a.name).localeCompare(firstName(b.name)) || a.name.localeCompare(b.name),
      )
  return (['red', 'blue'] as const)
    .map((key) => ({ key, rows: byTeam(key) }))
    .filter((g) => g.rows.length > 0)
}

export function Rankings({ board }: { board: Board }) {
  const [filter, setFilter] = useState<'all' | Role>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [soundOn, setSoundOn] = useState(true)
  const [soundLoaded, setSoundLoaded] = useState(false)
  const filtered = filter === 'all' ? board.rows : board.rows.filter((r) => r.role === filter)
  const groups = groupByTeam(filtered)

  // Load the persisted sound choice after mount (default ON). Reading
  // localStorage in an effect avoids a server/client hydration mismatch.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SOUND_STORAGE_KEY)
      if (stored !== null) setSoundOn(stored !== 'false')
    } catch {
      // localStorage unavailable; keep the default (sound on).
    }
    setSoundLoaded(true)
  }, [])

  // Persist the sound choice once it has been loaded.
  useEffect(() => {
    if (!soundLoaded) return
    try {
      window.localStorage.setItem(SOUND_STORAGE_KEY, soundOn ? 'true' : 'false')
    } catch {
      // Persisting is best-effort only.
    }
  }, [soundOn, soundLoaded])

  // Close the expanded breakdown when the period or view changes, so a
  // breakdown from one view is never shown under another view's rows.
  // The breakdown itself always comes from the current board data, so an
  // open row always matches the rows shown.
  useEffect(() => {
    setOpenId(null)
  }, [board.view, board.friday, board.month])

  function handleRowClick(rowId: string, isOpen: boolean) {
    const opening = !isOpen
    // Update the UI first so the row expands immediately. The click sound
    // plays asynchronously (the shared AudioContext resumes in the
    // background) and must never delay the expand; creating a fresh
    // AudioContext inside the tap handler is what made taps lag.
    setOpenId(opening ? rowId : null)
    vibrate(opening)
    if (soundOn) void playClick(opening)
  }

  return (
    <section aria-labelledby="rankings-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="rankings-title" className="font-display text-xl font-bold uppercase tracking-wide">
          Rankings
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Sound on' : 'Sound off'}
            title={soundOn ? 'Sound on' : 'Sound off'}
            onClick={() => setSoundOn((v) => !v)}
            className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {soundOn ? <Volume2 className="size-3.5" aria-hidden="true" /> : <VolumeX className="size-3.5" aria-hidden="true" />}
            {soundOn ? 'Sound on' : 'Sound off'}
          </button>
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
      </div>
      {groups.map((g) => {
        const team = board.teams.find((t) => t.key === g.key)
        return (
          <div key={g.key} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 px-1 font-display text-base font-bold uppercase tracking-wide">
              <span className={cn('size-2.5 rounded-full', g.key === 'red' ? 'bg-team-red' : 'bg-team-blue')} aria-hidden="true" />
              {team?.name ?? (g.key === 'red' ? 'Team Red' : 'Team Blue')}
            </h3>
            <ol className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
              {g.rows.map((r) => {
                const open = openId === r.id
                const breakdown = r.breakdown ?? []
                return (
                  <li key={r.id} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={`breakdown-${r.id}`}
                      onClick={() => handleRowClick(r.id, open)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {r.name}
                          {r.truck ? <span className="font-normal text-muted-foreground"> #{r.truck}</span> : null}
                        </p>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={cn('size-2 rounded-full', r.team === 'red' ? 'bg-team-red' : 'bg-team-blue')} aria-hidden="true" />
                          {team?.name} · {r.role === 'tech' ? 'Tech' : 'Asst'}
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
                    {open && <Breakdown id={`breakdown-${r.id}`} breakdown={breakdown} points={r.points} />}
                  </li>
                )
              })}
            </ol>
          </div>
        )
      })}
    </section>
  )
}
