import { NextResponse } from 'next/server'
import { getCompetitor, isManager } from '@/lib/auth'
import { todayISO } from '@/lib/dates'
import { MANAGERS } from '@/lib/managers'
import { readStore } from '@/lib/store'
import { teamsForMonth } from '@/lib/teams'

export const dynamic = 'force-dynamic'

// The live feed: comments (newest first) with the author's name and current
// team, plus the manager's announcements. The feed is for the team only:
// a competitor or the manager must be signed in to read it. Posting
// requires a competitor or manager sign-in, which the server actions
// enforce. A manager's comment carries their name with no team — the
// client marks it with a Manager tag instead of a team dot.
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
    if (c.managerId) {
      const m = MANAGERS.find((x) => x.id === c.managerId)
      return {
        id: c.id,
        personId: c.personId,
        name: m?.name ?? 'Manager',
        team: null,
        manager: true,
        text: c.text,
        createdAt: c.createdAt,
        parentId: c.parentId ?? null,
      }
    }
    const p = byId.get(c.personId)
    return {
      id: c.id,
      personId: c.personId,
      name: p?.name ?? 'Someone',
      team: teams[c.personId] ?? 'red',
      manager: false,
      text: c.text,
      createdAt: c.createdAt,
      parentId: c.parentId ?? null,
    }
  })
  // Announcements render twice: pinned at the top and in the feed in
  // chronological order. They come from the same array — no duplicated
  // storage, and posting one sends exactly one notification.
  const announcements = (store.announcements ?? []).map((a) => {
    const m = a.managerId ? MANAGERS.find((x) => x.id === a.managerId) : undefined
    return { id: a.id, text: a.text, createdAt: a.createdAt, name: m?.name ?? 'Manager' }
  })
  return NextResponse.json(
    { comments, announcements },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
