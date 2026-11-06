import type { Metadata } from 'next'
import { ManagerSignIn } from '@/components/manager-sign-in'
import { ScoreEntry } from '@/components/enter/score-entry'
import { isManager } from '@/lib/auth'
import { fridayOf, isISODate, todayISO } from '@/lib/dates'
import { readStore } from '@/lib/store'
import { teamsForMonth } from '@/lib/teams'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Enter Scores · The Weekly Showdown' }

export default async function EnterPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const store = await readStore()
  if (!(await isManager())) return <ManagerSignIn firstRun={!store.auth.hash} />

  const { week } = await searchParams
  let friday = fridayOf(isISODate(week) ? week : todayISO())
  const firstFriday = fridayOf(store.settings.startDate)
  if (friday < firstFriday) friday = firstFriday

  const teams = teamsForMonth(store, friday.slice(0, 7))
  const people = store.people
    .filter((p) => p.active !== false)
    .map((p) => ({ ...p, team: teams[p.id] ?? 'red' }))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'tech' ? -1 : 1))

  return (
    <ScoreEntry
      key={friday}
      friday={friday}
      firstFriday={firstFriday}
      people={people}
      rules={store.rules}
      initial={store.scores[friday] ?? {}}
      teamNames={{ red: store.settings.team1, blue: store.settings.team2 }}
    />
  )
}
