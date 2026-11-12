import { randomBytes } from 'node:crypto'
import { NextResponse, after } from 'next/server'
import { getSessionState } from '@/lib/auth'
import { todayISO } from '@/lib/dates'
import { MANAGERS } from '@/lib/managers'
import { notifyDirectMessage, ownerKeyFor } from '@/lib/push'
import { mutateStore, readStore } from '@/lib/store'
import { teamsForMonth } from '@/lib/teams'
import type { Store } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Private 1:1 direct messages. A conversation is visible ONLY to its two
// participants — competitors and managers alike. Every handler below
// enforces that server-side: signed-out requests get 401, and any request
// for a conversation the requester is not a party to gets 403 (or the
// conversation simply never appears in their list). The other party's
// identity and message content are never exposed to anyone else.
//
// A user is identified by a key: `person:<roster id>` for a competitor,
// `manager:<manager id>` for a manager — the same key push subscriptions
// are owned by, so a DM push goes to exactly the recipient.
//
// Endpoints (all JSON, no-store):
//   GET  /api/messages               — my conversations (newest first) + totalUnread
//   GET  /api/messages?people=1      — everyone I can message (not me)
//   GET  /api/messages?with=<key>    — one thread, oldest first; marks it read for me
//   POST /api/messages { toKey, text } — send a message (500 chars max)

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

  const withKey = url.searchParams.get('with')
  if (withKey) {
    // One thread. The other party must be a real user and not me; the
    // messages returned are only the ones between the two of us.
    const other = resolveParticipant(store, withKey)
    if (!other || withKey === me) {
      return NextResponse.json({ error: 'No conversation with that person.' }, { status: 403, headers: noStore })
    }
    const mine = (store.directMessages ?? []).filter(
      (m) => (m.fromKey === me && m.toKey === withKey) || (m.fromKey === withKey && m.toKey === me),
    )
    const messages = [...mine]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((m) => ({
        id: m.id,
        fromKey: m.fromKey,
        text: m.text,
        createdAt: m.createdAt,
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

  // Conversation list: one row per person I have messaged with, newest
  // first, with the last message and my unread count for that thread.
  // Anyone I have never messaged simply never appears here.
  const byOther = new Map<string, { last: (typeof store.directMessages)[number]; unread: number }>()
  for (const m of store.directMessages ?? []) {
    if (m.fromKey !== me && m.toKey !== me) continue
    const otherKey = m.fromKey === me ? m.toKey : m.fromKey
    const entry = byOther.get(otherKey) ?? { last: m, unread: 0 }
    if (m.createdAt > entry.last.createdAt) entry.last = m
    if (m.toKey === me && !m.readAt) entry.unread += 1
    byOther.set(otherKey, entry)
  }
  const conversations = [...byOther.entries()]
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
    .sort((a, b) => b.lastCreatedAt.localeCompare(a.lastCreatedAt))
  const totalUnread = conversations.reduce((n, c) => n + c.unread, 0)
  return NextResponse.json({ conversations, totalUnread }, { headers: noStore })
}

export async function POST(req: Request) {
  const session = await getSessionState()
  const me = meKey(session)
  if (!me) return unauthorized()
  const body = (await req.json().catch(() => null)) as { toKey?: unknown; text?: unknown } | null
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
