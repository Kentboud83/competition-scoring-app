'use client'

import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { saveWeekScores } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { addDays, weekLabel } from '@/lib/dates'
import { STAT_FIELDS, formatPts, hasEntry, scoreEntry } from '@/lib/scoring'
import type { Entry, Person, Rules, StatKey, TeamKey } from '@/lib/types'
import { cn } from '@/lib/utils'

type Draft = Record<string, Partial<Record<StatKey, string>>>

function toDraft(initial: Record<string, Entry>): Draft {
  const d: Draft = {}
  for (const [id, entry] of Object.entries(initial)) {
    d[id] = Object.fromEntries(Object.entries(entry).map(([k, v]) => [k, String(v)]))
  }
  return d
}

function toEntry(raw: Partial<Record<StatKey, string>> | undefined): Entry {
  const e: Entry = {}
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (v === '' || v === undefined) continue
    const n = Number(v)
    if (Number.isFinite(n)) e[k as StatKey] = n
  }
  return e
}

export function ScoreEntry({
  friday,
  firstFriday,
  people,
  rules,
  initial,
  teamNames,
}: {
  friday: string
  firstFriday: string
  people: (Person & { team: TeamKey })[]
  rules: Rules
  initial: Record<string, Entry>
  teamNames: Record<TeamKey, string>
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial))
  const [open, setOpen] = useState<string | null>(people[0]?.id ?? null)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [pending, start] = useTransition()

  const totals = useMemo(
    () => Object.fromEntries(people.map((p) => [p.id, scoreEntry(toEntry(draft[p.id]), rules, !!p.truck)])),
    [draft, people, rules],
  )

  const update = (id: string, key: StatKey, value: string) => {
    setDraft((d) => ({ ...d, [id]: { ...d[id], [key]: value } }))
    setDirty(true)
    setStatus('idle')
  }

  const save = () =>
    start(async () => {
      const payload = Object.fromEntries(
        people.map((p) => {
          const e = toEntry(draft[p.id])
          // Driving scores belong to truck drivers, reports to everyone
          // else: leaving the other group's value out here removes it
          // from the stored week entry.
          if (p.truck) delete e.reports
          else delete e.driving
          return [p.id, e]
        }),
      )
      const res = await saveWeekScores(friday, payload)
      if (res.ok) {
        setDirty(false)
        setStatus('saved')
        router.refresh()
      } else setStatus('error')
    })

  const enteredCount = people.filter((p) => hasEntry(toEntry(draft[p.id]))).length
  const go = (offset: number) => `/enter?week=${addDays(friday, offset)}`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        {friday > firstFriday ? (
          <Link href={go(-7)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Previous week">
            <ChevronLeft className="size-5" />
          </Link>
        ) : (
          <span className="size-9" aria-hidden="true" />
        )}
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide">Week of {weekLabel(friday)}</h1>
          <p className="text-xs text-muted-foreground">
            {enteredCount} of {people.length} entered
          </p>
        </div>
        <Link href={go(7)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Next week">
          <ChevronRight className="size-5" />
        </Link>
      </div>

      <ul className="flex flex-col gap-2">
        {people.map((p) => {
          const isOpen = open === p.id
          const entered = hasEntry(toEntry(draft[p.id]))
          return (
            <li key={p.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : p.id)}
                aria-expanded={isOpen}
                aria-controls={`entry-${p.id}`}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className={cn('size-2.5 shrink-0 rounded-full', p.team === 'red' ? 'bg-team-red' : 'bg-team-blue')} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {p.name}
                    {p.truck ? <span className="font-normal text-muted-foreground"> #{p.truck}</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.role === 'tech' ? 'Tech' : 'Asst'} · {teamNames[p.team]}
                  </span>
                </span>
                {entered && <Check className="size-4 text-emerald-400" aria-label="Has scores" />}
                <span className="font-display text-2xl font-bold tabular-nums">{formatPts(totals[p.id])}</span>
                <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
              </button>
              {isOpen && (
                <div id={`entry-${p.id}`} className="grid grid-cols-2 gap-3 border-t border-border p-4 sm:grid-cols-3">
                  {STAT_FIELDS.filter(
                    (f) => (f.key !== 'driving' || p.truck) && (f.key !== 'reports' || !p.truck),
                  ).map((f) => (
                    <label key={f.key} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                      {f.label}
                      <input
                        type="number"
                        inputMode={f.allowNegative || f.step ? 'decimal' : 'numeric'}
                        step={f.step ?? 1}
                        min={f.allowNegative ? undefined : 0}
                        value={draft[p.id]?.[f.key] ?? ''}
                        onChange={(e) => update(p.id, f.key, e.target.value)}
                        placeholder={f.key === 'driving' ? `${rules.drivingCutoff}+ safe` : '0'}
                        className="h-11 rounded-lg border border-input bg-background px-3 text-base text-foreground tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </label>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 px-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
          <p className="flex-1 text-sm text-muted-foreground" aria-live="polite">
            {status === 'saved' ? 'Saved — board is live.' : status === 'error' ? 'Could not save. Try again.' : dirty ? 'Unsaved changes' : 'All changes saved'}
          </p>
          <Button onClick={save} disabled={pending || !dirty} size="lg">
            {pending ? 'Saving…' : 'Save week'}
          </Button>
        </div>
      </div>
    </div>
  )
}
