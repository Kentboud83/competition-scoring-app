import { addDays, fridayOf, monthLabel, monthOf, prevMonth, weekLabel } from './dates'
import { drivingPoints, hasEntry, scoreEntry, STAT_FIELDS } from './scoring'
import { teamsForMonth } from './teams'
import type { Entry, Person, Role, Rules, Store, TeamKey, View } from './types'

export type BreakdownLine = {
  key: string
  label: string
  raw: number
  points: number
  rate?: number
  detail?: string
}

export type DrivingWeek = { friday: string; score: number }

export type BoardRow = {
  id: string
  name: string
  role: Role
  truck?: string
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
  /** Raw driving scores: this week's score, every scored week this month, and the driving points in the current view. */
  driving: { week: number | null; weeks: DrivingWeek[]; points: number }
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

export type Award = { name: string; points: number; team: TeamKey; truck?: string } | null

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

function pointsFor(store: Store, person: Person, fridays: string[]) {
  let total = 0
  let entered = false
  // Driving counts for truck drivers, reports for everyone else
  // (see lib/scoring.ts).
  const isDriver = !!person.truck
  for (const f of fridays) {
    const e = store.scores[f]?.[person.id]
    if (hasEntry(e)) entered = true
    total += scoreEntry(e, store.rules, isDriver)
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
// the points total for the period and how many weeks were perfect (100),
// safe (at/above the cutoff, below 100) vs unsafe at the driving cutoff,
// instead of summing the raw driving scores.
// Bonus is 1:1 in scoreEntry (there is no bonus rule value), so its rate is 1.
export function computeBreakdown(entries: Entry[], rules: Rules, isDriver = true): BreakdownLine[] {
  const rates: Record<string, number> = {
    reports: rules.report,
    jobs: rules.job,
    fwa: rules.fwa,
    callbacks: rules.callback,
    highGp: rules.highGp,
    amber: rules.amber,
    early: rules.early,
    onQuote: rules.onQuote,
    hoursOver: rules.lateHour,
    safety: rules.safety,
    bonus: 1,
  }
  const lines: BreakdownLine[] = []
  for (const field of STAT_FIELDS) {
    if (field.key === 'driving') {
      // No driving line for people without a truck: their driving score
      // earns no points, so there is nothing to break down.
      if (!isDriver) continue
      let safeWeeks = 0
      let unsafeWeeks = 0
      let perfectWeeks = 0
      let drivingPointsTotal = 0
      for (const e of entries) {
        if (e.driving == null) continue
        drivingPointsTotal += drivingPoints(e.driving, rules)
        if (e.driving === 100) {
          perfectWeeks += 1
        } else if (e.driving >= rules.drivingCutoff) {
          safeWeeks += 1
        } else {
          unsafeWeeks += 1
        }
      }
      if (safeWeeks > 0 || unsafeWeeks > 0 || perfectWeeks > 0) {
        const parts: string[] = []
        if (perfectWeeks > 0) parts.push(`${perfectWeeks} perfect week${perfectWeeks === 1 ? '' : 's'}`)
        if (safeWeeks > 0) parts.push(`${safeWeeks} safe week${safeWeeks === 1 ? '' : 's'}`)
        if (unsafeWeeks > 0) parts.push(`${unsafeWeeks} unsafe week${unsafeWeeks === 1 ? '' : 's'}`)
        lines.push({
          key: 'driving',
          label: 'Driving',
          raw: safeWeeks + unsafeWeeks + perfectWeeks,
          points: clean(drivingPointsTotal),
          detail: parts.join(', '),
        })
      }
      continue
    }
    // No reports line for truck drivers: reports are the assistants'
    // replacement for driving, so drivers earn nothing from them.
    if (field.key === 'reports' && isDriver) continue
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
  const teamMap = teamsForMonth(store, month)
  const monthWeeks = weeksInMonth(store, month)
  const prevFridays = view === 'week' ? [prev] : weeksInMonth(store, prevMonth(month))
  const active = store.people.filter((p) => p.active !== false)
  const base = active.map((p) => {
    const week = pointsFor(store, p, [friday])
    const monthPts = pointsFor(store, p, monthWeeks)
    const prior = pointsFor(store, p, prevFridays)
    const points = view === 'week' ? week.total : monthPts.total
    const current = view === 'week' ? week : monthPts
    let jobsMonth = 0
    let fwaMonth = 0
    for (const f of monthWeeks) {
      const e = store.scores[f]?.[p.id]
      jobsMonth += e?.jobs ?? 0
      fwaMonth += e?.fwa ?? 0
    }
    const periodFridays = view === 'week' ? [friday] : monthWeeks
    const periodEntries = periodFridays
      .map((f) => store.scores[f]?.[p.id])
      .filter((e): e is Entry => !!e && hasEntry(e))
    const breakdown = computeBreakdown(periodEntries, store.rules, !!p.truck)
    // Raw driving scores for the Driving tab: this week's score, every
    // scored week this month, and the driving points in the current view
    // (zero for anyone without a truck).
    const drivingWeeks: DrivingWeek[] = monthWeeks
      .map((f) => ({ friday: f, score: store.scores[f]?.[p.id]?.driving }))
      .filter((w): w is DrivingWeek => typeof w.score === 'number')
    const driving = {
      week: store.scores[friday]?.[p.id]?.driving ?? null,
      weeks: drivingWeeks,
      points: p.truck
        ? clean(periodFridays.reduce((s, f) => s + drivingPoints(store.scores[f]?.[p.id]?.driving, store.rules), 0))
        : 0,
    }
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      truck: p.truck,
      team: teamMap[p.id] ?? 'red',
      week: week.total,
      month: monthPts.total,
      points,
      entered: current.entered,
      jobsMonth,
      fwaMonth,
      breakdown,
      driving,
      prior: prior.entered && current ? points - prior.total : null,
    }
  })
  const sorted = [...base].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
  const top = sorted[0]?.points ?? 0
  const rows: BoardRow[] = []
  let lastPts = Number.NaN
  let lastRank = 0
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]
    const rank = r.points === lastPts ? lastRank : i + 1
    lastPts = r.points
    lastRank = rank
    const { prior: _prior, ...rest } = r
    rows.push({ ...rest, rank, behind: top - r.points })
  }
  const teams: TeamSummary[] = (['red', 'blue'] as TeamKey[]).map((key) => {
    const members = rows.filter((r) => r.team === key)
    const week = members.reduce((s, r) => s + r.week, 0)
    const monthPts = members.reduce((s, r) => s + r.month, 0)
    return {
      key,
      name: key === 'red' ? store.settings.team1 : store.settings.team2,
      week,
      month: monthPts,
      points: view === 'week' ? week : monthPts,
      techs: members.filter((m) => m.role === 'tech').length,
      assts: members.filter((m) => m.role === 'asst').length,
      jobsMonth: members.reduce((s, r) => s + r.jobsMonth, 0),
    }
  })
  const [red, blue] = teams
  const anyScores = rows.some((r) => r.entered)
  const leader: TeamKey | 'tie' | null = !anyScores ? null : red.points === blue.points ? 'tie' : red.points > blue.points ? 'red' : 'blue'
  const best = (role: Role) => {
    const r = rows.find((x) => x.role === role && x.entered)
    return r ? { name: r.name, points: r.points, team: r.team, truck: r.truck } : null
  }
  const improvedCandidate = base
    .filter((r) => r.prior !== null)
    .sort((a, b) => (b.prior ?? 0) - (a.prior ?? 0))[0]
  return {
    view,
    friday,
    month,
    weekLabel: weekLabel(friday),
    monthLabel: monthLabel(month),
    startDate: store.settings.startDate,
    rows,
    teams,
    leader,
    margin: Math.abs(red.points - blue.points),
    awards: {
      tech: best('tech'),
      asst: best('asst'),
      improved: improvedCandidate ? { name: improvedCandidate.name, points: improvedCandidate.points, team: improvedCandidate.team, truck: improvedCandidate.truck, gain: improvedCandidate.prior ?? 0 } : null,
    },
    jobs: {
      completed: store.jobsCompleted?.[month] ?? rows.reduce((s, r) => s + r.jobsMonth, 0),
      projected: store.projections[month] ?? null,
    },
    fwaTotalMonth: rows.reduce((s, r) => s + r.fwaMonth, 0),
    updatedAt: store.updatedAt,
  }
}
