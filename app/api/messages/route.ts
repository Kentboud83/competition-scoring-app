import { randomBytes } from 'node:crypto'
import { NextResponse, after } from 'next/server'
import { getSessionState } from '@/lib/auth'
import { todayISO } from '@/lib/dates'
import { MANAGERS } from '@/lib/managers'
import { notifyDirectMessage, notifyGroupMessage, ownerKeyFor } from '@/lib/push'
import { mutateStore, readStore } from '@/lib/store'
import { teamsForMonth } from '@/lib/teams'
import type { GroupConversation, Store } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Private direct messages — 1:1 and groups. A conversation is visible
// ONLY to its participants — competitors and managers alike. Every
// handler below enforces that server-side: signed-out requests get 401,
// and any request for a conversation the requester is not a party to
// gets 403 (or the conversation simply never appears in their list).
// The other parties' identities and message content are never exposed
// to anyone else.
//
// A user is identified by a key: `person:<roster id>` for a competitor,
// `manager:<manager id>` for a manager — the same key push subscriptions
// are owned by, so a DM push goes to exactly the recipient(s).
//
// Group messages live in the same `directMessages` array as 1:1
// messages (same 500-message cap) with `groupId` set and `toKey` set
// to `group:<group id>`; group membership lives in `messageGroups`
// and is fixed at creation. A group message's `readBy` lists the
// member keys (other than the sender) who have opened the thread;
// 1:1 messages keep the single `readAt` timestamp instead.
//
// Endpoints (all JSON, no-store):
//   GET  /api/messages               — my conversations (1:1 + groups, newest first) + totalUnread
//   GET  /api/messages?people=1      — everyone I can message (not me)
//   GET  /api/messages?with=<key>    — one 1:1 thread, oldest first; marks it read for me
//   GET  /api/messages?group=<id>    — one group thread, oldest first; marks it read for me
//   POST /api/messages { toKey, text }            — send a 1:1 message (500 chars max)
//   POST /api/messages { groupId, text }          — send a message to a group I'm in
//   POST /api/messages { memberKeys: [...] }       — create a group (2+ other people)

type Session = Awaited<ReturnType<typeof getSessionState>>

type Participant = { key: string; name: string; team: 'red' | 'blue' | null; manager: boolean }

function meKey(session: Session): string | null {
  if (session.manager) return ownerKeyFor('', session.manager.id)
  if (session.competitor) return ownerKeyFor(session.competitor.id)
  return null
}

function meName(session: Session): string {
  return session.manager?.name ?? session.competitor?.name ?? 'Someone'
}

function resolveParticipant(store: Store, key: string): Participant | null {
  if (key.startsWith('person:')) {
    const id = key.slice('person:'.length)
    const p = store.people.find((x) => x.id === id && x.active !== false)
    if (!p) return null
    const teams = teamsForMonth(store, todayISO().slice(0, 7))
    return { key, name: p.name, team: teams[p.id] ?? 'red', manager: false }
  }
  if (key.startsWith('manager:')) {
    const id = key.slice('manager:'.length)
    const m = MANAGERS.find((x) => x.id === id)
    if (!m) return null
    return { key, name: m.name, team: null, manager: true }
  }
  return null
}

function resolveGroup(store: Store, id: string): GroupConversation | null {
  return (store.messageGroups ?? []).find((g) => g.id === id) ?? null
}

// The group's display name: the other members' names, joined —
// "Isaiah, Kaleb, Lance". The viewer themself is never listed.
function groupName(store: Store, group: GroupConversation, me: string): string {
  const names = group.members
    .filter((k) => k !== me)
    .map((k) => resolveParticipant(store, k)?.name)
    .filter((n): n is string => Boolean(n))
  return names.length > 0 ? names.join(', ') : 'Group chat'
}

function groupView(store: Store, group: GroupConversation, me: string) {
  const members = group.members
    .map((k) => resolveParticipant(store, k))
    .filter((p): p is Participant => p !== null)
  return { id: group.id, name: groupName(store, group, me), members }
}

const noStore = { 'Cache-Control': 'no-store' }

function unauthorized() {
  return NextResponse.json({ error: 'Sign-in required' }, { status: 401, headers: noStore })
}

export async function GET(req: Request) {
  const session = await getSessionState()
  const me = meKey(session)
  if (!me) return unauthorized()
  const store = await readStore()
  const url = new URL(req.url)

  // Everyone I can start a conversation with: the whole active roster
  // plus all managers, except me. Names and teams are already visible
  // to every signed-in user on the Board, so listing them here leaks
  // nothing.
  if (url.searchParams.get('people') === '1') {
    const teams = teamsForMonth(store, todayISO().slice(0, 7))
    const people: Participant[] = [
      ...MANAGERS.map((m) => ({ key: `manager:${m.id}`, name: m.name, team: null as const, manager: true })),
      ...store.people
        .filter((p) => p.active !== false)
        .map((p) => ({ key: `person:${p.id}`, name: p.name, team: teams[p.id] ?? ('red' as const), manager: false })),
    ]
      .filter((p) => p.key !== me)
      .sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json({ people }, { headers: noStore })
  }

  const groupId = url.searchParams.get('group')
  if (groupId) {
    // One group thread. The group must exist and I must be a member —
    // a missing group and a group I'm not in both get the same 403, so
    // nobody can probe for groups they don't belong to.
    const group = resolveGroup(store, groupId)
    if (!group || !group.members.includes(me)) {
      return NextResponse.json({ error: 'No conversation like that.' }, { status: 403, headers: noStore })
    }
    const mine = (store.directMessages ?? []).filter((m) => m.groupId === groupId)
    // Read receipts, computed server-side so the client never has to
    // map member keys to names: who has read each message (other than
    // the sender), and whether every other member has read it.
    const messages = [...mine]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((m) => {
        const readBy = (m.readBy ?? []).filter((k) => k !== m.fromKey)
        const others = group.members.filter((k) => k !== m.fromKey)
        const readByNames = readBy
          .map((k) => resolveParticipant(store, k)?.name)
          .filter((n): n is string => Boolean(n))
        return {
          id: m.id,
          fromKey: m.fromKey,
          text: m.text,
          createdAt: m.createdAt,
          readByNames,
          readByAll: others.length > 0 && others.every((k) => readBy.includes(k)),
          mine: m.fromKey === me,
        }
      })
    // Opening the thread marks the other members' messages as read for
    // me only. A quiet write: the Board's updatedAt is preserved.
    const hasUnread = mine.some((m) => m.fromKey !== me && !(m.readBy ?? []).includes(me))
    if (hasUnread) {
      await mutateStore(
        (s) => {
          for (const m of s.directMessages ?? []) {
            if (m.groupId === groupId && m.fromKey !== me && !(m.readBy ?? []).includes(me)) {
              m.readBy = [...(m.readBy ?? []), me]
            }
          }
        },
        { preserveUpdatedAt: true },
      )
    }
    return NextResponse.json({ group: groupView(store, group, me), messages }, { headers: noStore })
  }

  const withKey = url.searchParams.get('with')
  if (withKey) {
    // One 1:1 thread. The other party must be a real user and not me;
    // the messages returned are only the ones between the two of us.
    const other = resolveParticipant(store, withKey)
    if (!other || withKey === me) {
      return NextResponse.json({ error: 'No conversation with that person.' }, { status: 403, headers: noStore })
    }
    const mine = (store.directMessages ?? []).filter(
      (m) => !m.groupId && ((m.fromKey === me && m.toKey === withKey) || (m.fromKey === withKey && m.toKey === me)),
    )
    const messages = [...mine]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((m) => ({
        id: m.id,
        fromKey: m.fromKey,
        text: m.text,
        createdAt: m.createdAt,
        // readAt is carried so the sender can see the read receipt on
        // their own messages; the recipient's view ignores it.
        readAt: m.readAt ?? null,
        mine: m.fromKey === me,
      }))
    // Opening the thread marks their messages to me as read — for me
    // only. A quiet write: the Board's updatedAt is preserved.
    const hasUnread = mine.some((m) => m.toKey === me && !m.readAt)
    if (hasUnread) {
      const now = new Date().toISOString()
      await mutateStore(
        (s) => {
          for (const m of s.directMessages ?? []) {
            if (m.toKey === me && m.fromKey === withKey && !m.readAt) m.readAt = now
          }
        },
        { preserveUpdatedAt: true },
      )
    }
    return NextResponse.json({ other, messages }, { headers: noStore })
  }

  // Conversation list: one row per person I have messaged with, plus one
  // row per group I'm in that has at least one message — newest first,
  // with the last message and my unread count for that conversation.
  // Anyone I have never messaged simply never appears here.
  const byOther = new Map<string, { last: (typeof store.directMessages)[number]; unread: number }>()
  for (const m of store.directMessages ?? []) {
    if (m.groupId) continue
    if (m.fromKey !== me && m.toKey !== me) continue
    const otherKey = m.fromKey === me ? m.toKey : m.fromKey
    const entry = byOther.get(otherKey) ?? { last: m, unread: 0 }
    if (m.createdAt > entry.last.createdAt) entry.last = m
    if (m.toKey === me && !m.readAt) entry.unread += 1
    byOther.set(otherKey, entry)
  }
  type Row = {
    other?: Participant
    group?: { id: string; name: string; members: Participant[] }
    lastText: string
    lastCreatedAt: string
    lastFromMe: boolean
    unread: number
  }
  const rows: Row[] = [...byOther.entries()]
    .map(([otherKey, entry]) => {
      const other = resolveParticipant(store, otherKey)
      if (!other) return null
      return {
        other,
        lastText: entry.last.text,
        lastCreatedAt: entry.last.createdAt,
        lastFromMe: entry.last.fromKey === me,
        unread: entry.unread,
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
  for (const group of store.messageGroups ?? []) {
    if (!group.members.includes(me)) continue
    const msgs = (store.directMessages ?? []).filter((m) => m.groupId === group.id)
    if (msgs.length === 0) continue
    const last = msgs.reduce((a, b) => (b.createdAt > a.createdAt ? b : a))
    const unread = msgs.filter((m) => m.fromKey !== me && !(m.readBy ?? []).includes(me)).length
    rows.push({
      group: groupView(store, group, me),
      lastText: last.text,
      lastCreatedAt: last.createdAt,
      lastFromMe: last.fromKey === me,
      unread,
    })
  }
  rows.sort((a, b) => b.lastCreatedAt.localeCompare(a.lastCreatedAt))
  const totalUnread = rows.reduce((n, c) => n + c.unread, 0)
  return NextResponse.json({ conversations: rows, totalUnread }, { headers: noStore })
}

export async function POST(req: Request) {
  const session = await getSessionState()
  const me = meKey(session)
  if (!me) return unauthorized()
  const body = (await req.json().catch(() => null)) as {
    toKey?: unknown
    groupId?: unknown
    memberKeys?: unknown
    text?: unknown
  } | null

  // --- Create a group: { memberKeys: [2+ other people] } ---
  // Membership is fixed at creation; the creator is always a member.
  if (body?.memberKeys !== undefined) {
    const raw = Array.isArray(body.memberKeys) ? body.memberKeys.map((k) => String(k)) : []
    const keys = [...new Set(raw)]
    if (keys.length < 2) {
      return NextResponse.json({ error: 'Pick at least two people for a group.' }, { status: 400 })
    }
    if (keys.includes(me)) {
      return NextResponse.json({ error: 'You are already in the group.' }, { status: 400 })
    }
    const store = await readStore()
    for (const k of keys) {
      if (!resolveParticipant(store, k)) {
        return NextResponse.json({ error: 'No such person.' }, { status: 403, headers: noStore })
      }
    }
    const id = randomBytes(12).toString('hex')
    const group: GroupConversation = { id, members: [me, ...keys], createdAt: new Date().toISOString(), createdBy: me }
    await mutateStore(
      (s) => {
        s.messageGroups = [...(s.messageGroups ?? []), group]
      },
      { preserveUpdatedAt: true },
    )
    return NextResponse.json({ ok: true, group: groupView(store, group, me) }, { headers: noStore })
  }

  // --- Send to a group: { groupId, text } ---
  if (typeof body?.groupId === 'string' && body.groupId) {
    const raw = String(body?.text ?? '')
    const text = raw.replace(/\s+/g, ' ').trim()
    if (!text) return NextResponse.json({ error: 'Write something first.' }, { status: 400 })
    if (text.length > 500) return NextResponse.json({ error: 'Keep it to 500 characters.' }, { status: 400 })
    const store = await readStore()
    const group = resolveGroup(store, body.groupId)
    if (!group || !group.members.includes(me)) {
      return NextResponse.json({ error: 'No conversation like that.' }, { status: 403, headers: noStore })
    }
    const createdAt = new Date().toISOString()
    const id = randomBytes(12).toString('hex')
    await mutateStore(
      (s) => {
        const list = s.directMessages ?? []
        list.unshift({ id, fromKey: me, toKey: `group:${group.id}`, groupId: group.id, text, createdAt, readBy: [] })
        // Same 500 cap as 1:1 — group messages count toward it.
        s.directMessages = list.slice(0, 500)
      },
      { preserveUpdatedAt: true },
    )
    // Push goes to every other member, after the response, so a slow or
    // failing push service can never delay or break the send itself.
    const preview = text.length > 100 ? `${text.slice(0, 100)}…` : text
    const recipients = group.members.filter((k) => k !== me)
    const notify = () =>
      notifyGroupMessage({
        recipientKeys: recipients,
        title: `Group message · ${meName(session)}`,
        body: preview,
      })
    try {
      after(notify)
    } catch {
      void notify()
    }
    return NextResponse.json(
      { ok: true, message: { id, fromKey: me, text, createdAt, readByNames: [], readByAll: false, mine: true } },
      { headers: noStore },
    )
  }

  // --- Send a 1:1 message: { toKey, text } ---
  const toKey = String(body?.toKey ?? '')
  const raw = String(body?.text ?? '')
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return NextResponse.json({ error: 'Write something first.' }, { status: 400 })
  if (text.length > 500) return NextResponse.json({ error: 'Keep it to 500 characters.' }, { status: 400 })
  if (!toKey || toKey === me) {
    return NextResponse.json({ error: 'Pick someone to message.' }, { status: 400 })
  }

  // Verify the recipient exists BEFORE saving: no messages to ghosts,
  // and no way to probe for a conversation with someone who isn't a user.
  const store = await readStore()
  const recipient = resolveParticipant(store, toKey)
  if (!recipient) {
    return NextResponse.json({ error: 'No such person.' }, { status: 403, headers: noStore })
  }

  const createdAt = new Date().toISOString()
  const id = randomBytes(12).toString('hex')
  await mutateStore(
    (s) => {
      const list = s.directMessages ?? []
      list.unshift({ id, fromKey: me, toKey, text, createdAt })
      // Cap the whole collection at 500 — the oldest messages across all
      // conversations fall off first, like the feed's 200 cap.
      s.directMessages = list.slice(0, 500)
    },
    { preserveUpdatedAt: true },
  )

  // Push goes to the recipient only, after the response, so a slow or
  // failing push service can never delay or break the send itself.
  const preview = text.length > 100 ? `${text.slice(0, 100)}…` : text
  const notify = () =>
    notifyDirectMessage({ recipientKey: toKey, title: `Private message · ${meName(session)}`, body: preview })
  try {
    after(notify)
  } catch {
    void notify()
  }
  return NextResponse.json(
    { ok: true, message: { id, fromKey: me, text, createdAt, mine: true } },
    { headers: noStore },
  )
}
