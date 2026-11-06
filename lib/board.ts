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

export function computeBoard(store: Store, opts: { view: View; friday?: string; month?: string }): Board {
  const today = new Date()
  const friday = opts.friday ?? fridayOf(today)
  const month = opts.month ?? monthOf(friday)
  const weekFridays = [friday]
  const monthFridays = weeksInMonth(store, month)
  const prev = prevMonth(month)
  const prevFridays = weeksInMonth(store, prev)
  const teams = teamsForMonth(store, month)

  const rows: BoardRow[] = store.people
    .filter((p) => p.active !== false)
    .map((p) => {
      const week = pointsFor(store, p.id, weekFridays)
      const monthPoints = pointsFor(store, p.id, monthFridays)
      const jobsMonth = monthFridays.reduce((s, f) => s + (store.scores[f]?.[p.id]?.jobs ?? 0), 0)
      const fwaMonth = monthFridays.reduce((s, f) => s + (store.scores[f]?.[p.id]?.fwa ?? 0), 0)
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        team: teams[p.id] ?? 'red',
        rank: 0,
        week: week.total,
        month: monthPoints.total,
        points: opts.view === 'week' ? week.total : monthPoints.total,
        behind: 0,
        jobsMonth,
        fwaMonth,
        entered: opts.view === 'week' ? week.entered : monthPoints.entered,
      }
    })

  rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
  rows.forEach((r, i) => {
    r.rank = i + 1
    r.behind = i === 0 ? 0 : rows[0].points - r.points
  })

  const teamByKey = new Map<TeamKey, TeamSummary>()
  for (const key of ['red', 'blue'] as const) {
    teamByKey.set(key, {
      key,
      name: key === 'red' ? store.settings.team1 : store.settings.team2,
      week: 0,
      month: 0,
      points: 0,
      techs: 0,
      assts: 0,
      jobsMonth: 0,
    })
  }
  for (const r of rows) {
    const t = teamByKey.get(r.team)!
    t.week += r.week
    t.month += r.month
    t.points += r.points
    if (r.role === 'tech') t.techs++
    else t.assts++
    t.jobsMonth += r.jobsMonth
  }
  const teamSummaries = Array.from(teamByKey.values())

  // ✅ correct even when the leader is Blue
  const leader = teamSummaries[0].points === teamSummaries[1].points ? 'tie' : teamSummaries[0].points > teamSummaries[1].points ? teamSummaries[0].key : teamSummaries[1].key

  const bestTech = [...rows].filter((r) => r.role === 'tech').sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))[0]
  const bestAsst = [...rows].filter((r) => r.role === 'asst').sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))[0]

  let improved = null
  for (const r of rows) {
    const prevPoints = pointsFor(store, r.id, prevFridays).total
    const gain = r.month - prevPoints
    if (!improved || gain > improved.gain!) improved = { ...r, gain }
  }

  return {
    view: opts.view,
    friday,
    month,
    weekLabel: weekLabel(friday),
    monthLabel: monthLabel(month),
    startDate: store.settings.startDate,
    rows,
    teams: teamSummaries,
    leader,
    margin: Math.abs(teamSummaries[0].points - teamSummaries[1].points),
    awards: {
      tech: bestTech ? { name: bestTech.name, points: bestTech.points, team: bestTech.team } : null,
      asst: bestAsst ? { name: bestAsst.name, points: bestAsst.points, team: bestAsst.team } : null,
      improved: improved ? { name: improved.name, points: improved.month, team: improved.team, gain: improved.gain } : null,
    },
    jobs: {
      completed: store.jobsCompleted?.[month] ?? rows.reduce((s, r) => s + r.jobsMonth, 0),
      projected: store.projections[month] ?? null,
    },
    fwaTotalMonth: rows.reduce((s, r) => s + r.fwaMonth, 0),
    updatedAt: store.updatedAt,
  }
}

export function nextFriday(store: Store) {
  return addDays(fridayOf(new Date()), 7)
}
