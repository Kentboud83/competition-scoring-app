import type { Metadata } from 'next'
import { ManagePanel } from '@/components/manage/manage-panel'
import { ManagerSignIn } from '@/components/manager-sign-in'
import { isManager } from '@/lib/auth'
import { fridayOf, monthLabel, todayISO } from '@/lib/dates'
import { readStore } from '@/lib/store'
import { teamsForMonth } from '@/lib/teams'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Manage · The Weekly Showdown' }

export default async function ManagePage() {
  const store = await readStore()
  if (!(await isManager())) return <ManagerSignIn firstRun={!store.auth.hash} />

  let today = todayISO()
  if (today < store.settings.startDate) today = store.settings.startDate
  const month = fridayOf(today).slice(0, 7)
  const teams = teamsForMonth(store, month)
  const people = store.people
    .filter((p) => p.active !== false)
    .map((p) => ({ ...p, team: teams[p.id] ?? 'red' }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <ManagePanel
      month={month}
      monthName={monthLabel(month)}
      people={people}
      rules={store.rules}
      settings={store.settings}
      projection={store.projections[month]}
    />
  )
}
