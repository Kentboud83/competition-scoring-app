import { addDays, fridayOf, monthLabel, monthOf, prevMonth, weekLabel } from './dates'
import { hasEntry, scoreEntry, STAT_FIELDS } from './scoring'
import { teamsForMonth } from './teams'
import type { Entry, Role, Rules, Store, TeamKey, View } from './types'

export type BreakdownLine = {
  key: string
  label: string
  raw: number
  points: number
  rate?: number
  detail?: string
}

export type BoardRow = {
  id: string
  name: string
  role: Role
  team: TeamKey
  rank: number
  week: number
  month: number
  points: number
  behind: number
  jobsMonth: number
  fwaMonth: number
  entered: boolean
  breakdown: BreakdownLine[]
}

export type TeamSummary = {
  key: TeamKey
  name: string
  week: number
  month: number
  points: number
  techs: number
  assts: number
  jobsMonth: number
}

export type Award = { name: string; points: number; team: TeamKey } | null

export type Board = {
  view: View
  friday: string
  month: string
  weekLabel: string
  monthLabel: string
  startDate: string
  rows: BoardRow[]
  teams: TeamSummary[]
  leader: TeamKey | 'tie' | null
  margin: number
  awards: { tech: Award; asst: Award; improved: (Award & { gain?: number }) | null }
  jobs: { completed: number; projected: number | null }
  fwaTotalMonth: number
  updatedAt: string
}

function weeksInMonth(store: Store, month: string) {
  return Object.keys(store.scores).filter((f) => monthOf(f) === month)
}

function pointsFor(store: Store, id: string, fridays: string[]) {
  let total = 0
  let entered = false
  for (const f of fridays) {
    const e = store.scores[f]?.[id]
    if (hasEntry(e)) entered = true
    total += scoreEntry(e, store.rules)
  }
  return { total, entered }
}

const clean = (n: number) => {
  const v = Math.round(n * 10000) / 10000
  return v === 0 ? 0 : v
}

// Per-stat breakdown for one person over the given entries (the current
// view's Fridays). The lines' points add up to scoreEntry summed over the
// same entries, because each line uses the same store rules as scoreEntry.
// Driving is special: it is a score per week, not a count, so its line shows
// the points total for the period and how many weeks were safe vs unsafe at
// the driving cutoff, instead of summing the raw driving scores.
export function computeBreakdown(entries: Entry[], rules: Rules): BreakdownLine[] {
  const rates: Record<string, number> = {
    jobs: rules.job,
    fwa: rules.fwa,
    callbacks: rules.callback,
    highGp: rules.highGp,
    amber: rules.amber,
    early: rules.early,
    onQuote: rules.onQuote,
    hoursOver: rules.lateHour,
    safety: rules.safety,
    bonus: rules.bonus,
  }
  const lines: BreakdownLine[] = []
  for (const field of STAT_FIELDS) {
    if (field.key === 'driving') {
      let safeWeeks = 0
      let unsafeWeeks = 0
      let drivingPoints = 0
      for (const e of entries) {
        if (e.driving == null) continue
        if (e.driving >= rules.drivingCutoff) {
          safeWeeks += 1
          drivingPoints += rules.drivingSafe
        } else {
          unsafeWeeks += 1
          drivingPoints += rules.drivingUnsafe
        }
      }
      if (safeWeeks > 0 || unsafeWeeks > 0) {
        const parts: string[] = []
        if (safeWeeks > 0) parts.push(`${safeWeeks} safe week${safeWeeks === 1 ? '' : 's'}`)
        if (unsafeWeeks > 0) parts.push(`${unsafeWeeks} unsafe week${unsafeWeeks === 1 ? '' : 's'}`)
        lines.push({
          key: 'driving',
          label: 'Driving',
          raw: safeWeeks + unsafeWeeks,
          points: clean(drivingPoints),
          detail: parts.join(', '),
        })
      }
      continue
    }
    const raw = entries.reduce((s, e) => s + (e[field.key] ?? 0), 0)
    const points = clean(entries.reduce((s, e) => s + (e[field.key] ?? 0) * rates[field.key], 0))
    if (raw === 0 && points === 0) continue
    lines.push({ key: field.key, label: field.label, raw: clean(raw), points, rate: rates[field.key] })
  }
  return lines
}

export function computeBoard(store: Store, date: string, view: View): Board {
  const friday = fridayOf(date)
  const prev = addDays(friday, -7)
  const month = monthOf(friday)
  const monthWeeks = weeksInMonth(store, month)
  const prevWeeks = weeksInMonth(store, monthOf(prev))
  const base = store.people.map((p) => {
    const week = pointsFor(store, p.id, [friday])
    const month = pointsFor(store, p.id, monthWeeks)
    const points = view === 'week' ? week.total : month.total
    const prior = pointsFor(store, p.id, prevWeeks)
    const monthEntries = monthWeeks.map((f) => store.scores[f]?.[p.id]).filter((e): e is Entry => !!e)
    const jobsMonth = monthEntries.reduce((s, e) => s + (e.jobs ?? 0), 0)
    const fwaMonth = monthEntries.reduce((s, e) => s + (e.fwa ?? 0), 0)
    const entered = view === 'week' ? week.entered : month.entered
    const periodFridays = view === 'week' ? [friday] : monthWeeks
    const periodEntries = periodFridays
      .map((f) => store.scores[f]?.[p.id])
      .filter((e): e is Entry => !!e && hasEntry(e))
    const breakdown = computeBreakdown(periodEntries, store.rules)
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      team: p.team,
      rank: 0,
      week: week.total,
      month: month.total,
      points,
      behind: 0,
      jobsMonth,
      fwaMonth,
      entered,
      breakdown,
      prior: prior.total,
    }
  })
  const awardsTotal = base.filter((r) => r.entered).reduce((acc, r) => acc + r.points, 0)
  const best = (role: Role) => {
    const cands = base.filter((b) => b.role === role && b.entered)
    if (!cands.length || awardsTotal === 0) return null
    const pick = cands.reduce((best, cur) => (cur.points > best.points ? cur : best), cands[0])
    return { name: pick.name, points: pick.points, team: pick.team } as Award
  }
  const improved = base
    .filter((b) => b.points > b.prior)
    .sort((a, b) => b.points - b.prior - (a.points - a.prior))[0]
  const sorted = base.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
  const topPts = sorted[0]?.points ?? 0
  const rows: BoardRow[] = sorted.map((r, i) => {
    const { prior: _prior, ...rest } = r
    return { ...rest, rank: i + 1, behind: topPts - r.points }
  })
  const teams = teamsForMonth(store, month, rows, view)
  const [red, blue] = teams
  const anyScores = rows.some((r) => r.entered)
  const leader: TeamKey | 'tie' | null = !anyScores ? null : red.points === blue.points ? 'tie' : red.points > blue.points ? 'red' : 'blue'
  const monthFridays = weeksInMonth(store, month)
  const fridayIndex = monthFridays.indexOf(friday)
  const weeksDone = fridayIndex + 1
  const monthComp = rows.reduce((s, r) => s + r.jobsMonth, 0)
  const jobs = { completed: monthComp, projected: weeksDone > 0 ? Math.round((monthComp / weeksDone) * 4 * 10) / 10 : null }
  const fwaTotalMonth = rows.reduce((s, r) => s + r.fwaMonth, 0)
  return {
    view,
    friday,
    month,
    weekLabel: weekLabel(friday),
    monthLabel: monthLabel(month),
    startDate: addDays(friday, -4),
    rows,
    teams,
    leader,
    margin: Math.abs(red.points - blue.points),
    awards: {
      tech: best('tech'),
      asst: best('asst'),
      improved: improved && improved.points > improved.prior ? { name: improved.name, points: improved.points, team: improved.team, gain: improved.points - improved.prior } : null,
    },
    jobs,
    fwaTotalMonth,
    updatedAt: store.updatedAt,
  }
}
