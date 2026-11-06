import { addDays, fridayOf, monthLabel, monthOf, prevMonth, weekLabel } from './dates'
import { hasEntry, scoreEntry } from './scoring'
import { teamsForMonth } from './teams'
import type { Role, Store, TeamKey, View } from './types'

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

export function computeBoard(store: Store, date: string, view: View): Board {
  const friday = fridayOf(date)
  const month = monthOf(friday)
  const teamMap = teamsForMonth(store, month)
  const monthWeeks = weeksInMonth(store, month)
  const prevFridays = view === 'week' ? [addDays(friday, -7)] : weeksInMonth(store, prevMonth(month))

  const active = store.people.filter((p) => p.active !== false)
  const base = active.map((p) => {
    const week = pointsFor(store, p.id, [friday])
    const monthPts = pointsFor(store, p.id, monthWeeks)
    const prior = pointsFor(store, p.id, prevFridays)
    let jobsMonth = 0
    let fwaMonth = 0
    for (const f of monthWeeks) {
      jobsMonth += store.scores[f]?.[p.id]?.jobs ?? 0
      fwaMonth += store.scores[f]?.[p.id]?.fwa ?? 0
    }
    const points = view === 'week' ? week.total : monthPts.total
    const current = view === 'week' ? week.entered : monthPts.entered
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      team: teamMap[p.id] ?? 'red',
      week: week.total,
      month: monthPts.total,
      points,
      entered: current,
      jobsMonth,
      fwaMonth,
      prior: prior.entered && current ? points - prior.total : null,
    }
  })

  const sorted = [...base].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
  const top = sorted[0]?.points ?? 0
  let lastPts = Number.NaN
  let lastRank = 0
  const rows: BoardRow[] = sorted.map((r, i) => {
    const rank = r.points === lastPts ? lastRank : i + 1
    lastPts = r.points
    lastRank = rank
    const { prior: _prior, ...rest } = r
    return { ...rest, rank, behind: top - r.points }
  })

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
  const leader = !anyScores ? null : red.points === blue.points ? 'tie' : red.points > blue.points ? 'red' : 'blue'

  const best = (role: Role): Award => {
    const r = rows.find((x) => x.role === role && x.entered)
    return r ? { name: r.name, points: r.points, team: r.team } : null
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
      improved: improvedCandidate
        ? {
            name: improvedCandidate.name,
            points: improvedCandidate.points,
            team: improvedCandidate.team,
            gain: improvedCandidate.prior ?? 0,
          }
        : null,
    },
    jobs: {
      completed: rows.reduce((s, r) => s + r.jobsMonth, 0),
      projected: store.projections[month] ?? null,
    },
    fwaTotalMonth: rows.reduce((s, r) => s + r.fwaMonth, 0),
    updatedAt: store.updatedAt,
  }
}
