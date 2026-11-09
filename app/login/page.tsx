import type { Metadata } from 'next'
import { CompetitorSignIn } from '@/components/competitor-sign-in'
import { getCompetitor } from '@/lib/auth'
import { todayISO } from '@/lib/dates'
import { readStore } from '@/lib/store'
import { teamsForMonth } from '@/lib/teams'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Sign In · The Weekly Showdown' }

export default async function LoginPage() {
  const store = await readStore()
  const teams = teamsForMonth(store, todayISO().slice(0, 7))
  const people = store.people
    .filter((p) => p.active !== false)
    .map((p) => ({ id: p.id, name: p.name, team: teams[p.id] ?? 'red' }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const hasPassword: Record<string, boolean> = {}
  for (const p of people) hasPassword[p.id] = Boolean(store.auth.competitors?.[p.id])
  const signedInAs = await getCompetitor()
  return <CompetitorSignIn people={people} hasPassword={hasPassword} signedInAs={signedInAs} />
}
