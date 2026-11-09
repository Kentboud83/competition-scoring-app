import { NextResponse } from 'next/server'
import { todayISO } from '@/lib/dates'
import { readStore } from '@/lib/store'
import { teamsForMonth } from '@/lib/teams'

export const dynamic = 'force-dynamic'

// The live feed: comments (newest first) with the author's name and current
// team, plus the manager's announcements. Public to read; posting requires
// a competitor sign-in, which the server actions enforce.
export async function GET() {
  const store = await readStore()
  const teams = teamsForMonth(store, todayISO().slice(0, 7))
  const byId = new Map(store.people.map((p) => [p.id, p]))
  const comments = (store.comments ?? []).map((c) => {
    const p = byId.get(c.personId)
    return {
      id: c.id,
      personId: c.personId,
      name: p?.name ?? 'Someone',
      team: teams[c.personId] ?? 'red',
      text: c.text,
      createdAt: c.createdAt,
    }
  })
  return NextResponse.json(
    { comments, announcements: store.announcements ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
