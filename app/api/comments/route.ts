import { NextResponse } from 'next/server'
import { getCompetitor, getSessionState, isManager } from '@/lib/auth'
import { todayISO } from '@/lib/dates'
import { MANAGERS } from '@/lib/managers'
import { mutateStore, readStore } from '@/lib/store'
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
        editedAt: c.editedAt,
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
      editedAt: c.editedAt,
      parentId: c.parentId ?? null,
    }
  })
  // Announcements render twice: pinned at the top and in the feed in
  // chronological order. They come from the same array — no duplicated
  // storage, and posting one sends exactly one notification.
  const announcements = (store.announcements ?? []).map((a) => {
    const m = a.managerId ? MANAGERS.find((x) => x.id === a.managerId) : undefined
    return { id: a.id, text: a.text, createdAt: a.createdAt, editedAt: a.editedAt, name: m?.name ?? 'Manager' }
  })
  return NextResponse.json(
    { comments, announcements },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

// Edit a comment or announcement in place. The text changes; the original
// createdAt and position in the feed do not. Who can edit mirrors delete:
// the comment's author, or any signed-in manager (managers can edit any
// comment, including announcements). Editing is a quiet write: no push
// notification, and the Board's updatedAt is preserved, like every other
// feed write.
export async function PATCH(req: Request) {
  const session = await getSessionState()
  if (!session.manager && !session.competitor) {
    return NextResponse.json({ error: 'Sign-in required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  const body = (await req.json().catch(() => null)) as { id?: unknown; text?: unknown; kind?: unknown } | null
  const id = String(body?.id ?? '')
  const kind = body?.kind === 'announcement' ? 'announcement' : 'comment'
  const raw = String(body?.text ?? '')
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!id) return NextResponse.json({ error: 'Missing comment.' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'Write something first.' }, { status: 400 })
  if (text.length > 500) return NextResponse.json({ error: 'Keep it to 500 characters.' }, { status: 400 })

  // Verify existence and permission BEFORE mutating: mutateStore returns
  // the store, not the callback's value, so a check inside the callback
  // could never surface its error.
  const store = await readStore()
  if (kind === 'announcement') {
    if (!session.manager) return NextResponse.json({ error: 'Manager sign-in required.' }, { status: 403 })
    if (!(store.announcements ?? []).some((a) => a.id === id)) {
      return NextResponse.json({ error: 'That announcement is gone.' }, { status: 404 })
    }
  } else {
    const c = (store.comments ?? []).find((x) => x.id === id)
    if (!c) return NextResponse.json({ error: 'That comment is gone.' }, { status: 404 })
    const isAuthor = !!session.competitor && c.personId === session.competitor.id
    if (!session.manager && !isAuthor) {
      return NextResponse.json({ error: 'You can only edit your own comments.' }, { status: 403 })
    }
  }

  const now = new Date().toISOString()
  await mutateStore(
    (s) => {
      if (kind === 'announcement') {
        const a = (s.announcements ?? []).find((x) => x.id === id)
        if (a) {
          a.text = text
          a.editedAt = now
        }
      } else {
        const c = (s.comments ?? []).find((x) => x.id === id)
        if (c) {
          c.text = text
          c.editedAt = now
        }
      }
    },
    { preserveUpdatedAt: true },
  )
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
