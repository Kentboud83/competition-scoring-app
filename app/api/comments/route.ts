import { NextResponse } from 'next/server'
import { getCompetitor, isManager } from '@/lib/auth'
import { todayISO } from '@/lib/dates'
import { readStore } from '@/lib/store'
import { teamsForMonth } from '@/lib/teams'

export const dynamic = 'force-dynamic'

// The live feed: comments (newest first) with the author's name and current
// team, plus the manager's announcements. The feed is for the team only:
// a competitor or the manager must be signed in to read it. Posting
// requires a competitor sign-in, which the server actions enforce.
export async function GET() {
  const me = await getCompetitor()
  const manager = await isManager()
  if (!me && !manager) {
    return NextResponse.json({ error: 'Sign-in required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
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
