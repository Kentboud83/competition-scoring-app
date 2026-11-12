import { NextResponse } from 'next/server'
import { getSessionState } from '@/lib/auth'
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
  const session = await getSessionState()
  const me = session.competitor
  const manager = session.manager
  if (!me && !manager) {
    return NextResponse.json({ error: 'Sign-in required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  const store = await readStore()
  const teams = teamsForMonth(store, todayISO().slice(0, 7))
  const byId = new Map(store.people.map((p) => [p.id, p]))
  // `mine` tells the client whether the viewer wrote this comment, so the
  // Edit button shows only on the viewer's own posts. The client never
  // learns which manager wrote a post — only whether it is theirs.
  const comments = (store.comments ?? []).map((c) => {
    const mine =
      (!!me && c.personId === me.id) || (!!manager && !!c.managerId && c.managerId === manager.id)
    if (c.managerId) {
      const m = MANAGERS.find((x) => x.id === c.managerId)
      return {
        id: c.id,
        personId: c.personId,
        name: m?.name ?? 'Manager',
        team: null,
        manager: true,
        mine,
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
      mine,
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
    return {
      id: a.id,
      text: a.text,
      createdAt: a.createdAt,
      editedAt: a.editedAt,
      name: m?.name ?? 'Manager',
      mine: !!manager && !!a.managerId && a.managerId === manager.id,
    }
  })
  return NextResponse.json(
    { comments, announcements },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

// Edit a comment or announcement in place. The text changes; the original
// createdAt and position in the feed do not. Who can edit: ONLY the
// comment's own author — the competitor who wrote it, or the manager who
// wrote it (manager comments and announcements: the manager who posted
// them). A manager editing someone else's comment or announcement gets a
// 403. Delete is unchanged: the author or any signed-in manager can
// delete. Editing is a quiet write: no push notification, and the Board's
// updatedAt is preserved, like every other feed write.
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
    const a = (store.announcements ?? []).find((x) => x.id === id)
    if (!a) {
      return NextResponse.json({ error: 'That announcement is gone.' }, { status: 404 })
    }
    if (!session.manager || a.managerId !== session.manager.id) {
      return NextResponse.json({ error: 'You can only edit your own announcements.' }, { status: 403 })
    }
  } else {
    const c = (store.comments ?? []).find((x) => x.id === id)
    if (!c) return NextResponse.json({ error: 'That comment is gone.' }, { status: 404 })
    const isAuthor =
      (!!session.competitor && c.personId === session.competitor.id) ||
      (!!session.manager && !!c.managerId && c.managerId === session.manager.id)
    if (!isAuthor) {
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
