'use server'

import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import {
  COMPETITOR_COOKIE,
  SESSION_COOKIE,
  getCompetitor,
  hashPasscode,
  hashToken,
  isManager,
  newSessionToken,
  requireCompetitor,
  requireManager,
  setCompetitorCookie,
  setSessionCookie,
  verifyPasscode,
} from '@/lib/auth'
import { fridayOf, isISODate } from '@/lib/dates'
import { DEFAULT_RULES } from '@/lib/scoring'
import { incrementViews, mutateStore, readStore } from '@/lib/store'
import { STAT_KEYS, type Entry, type Role, type Rules, type TeamKey } from '@/lib/types'

type Result = { ok: true } | { ok: false; error: string }

const refreshAll = () => {
  revalidatePath('/', 'layout')
}

export async function signIn(passcode: string): Promise<Result> {
  const code = String(passcode ?? '').trim()
  if (code.length < 4 || code.length > 64) return { ok: false, error: 'Passcode must be at least 4 characters.' }

  // Verify BEFORE mutating. mutateStore returns the store, not the
  // callback's return value, so checking the passcode inside the callback
  // could never surface "That passcode is not correct." — a wrong passcode
  // used to return ok:true without recording a session, and the sign-in
  // form just looped back to "Sign in" with no message at all.
  const current = await readStore()
  if (current.auth.hash && current.auth.salt && !verifyPasscode(code, current.auth.salt, current.auth.hash)) {
    return { ok: false, error: 'That passcode is not correct.' }
  }

  const token = newSessionToken()
  await mutateStore((store) => {
    if (!store.auth.hash || !store.auth.salt) {
      const salt = randomBytes(16).toString('hex')
      store.auth.salt = salt
      store.auth.hash = hashPasscode(code, salt)
    }
    store.auth.sessions = [...store.auth.sessions.slice(-19), hashToken(token)]
  })

  await setSessionCookie(token)
  refreshAll()
  return { ok: true }
}

export async function signOut(): Promise<Result> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) {
    const hashed = hashToken(token)
    await mutateStore((store) => {
      store.auth.sessions = store.auth.sessions.filter((s) => s !== hashed)
    })
  }
  jar.delete(SESSION_COOKIE)
  refreshAll()
  return { ok: true }
}

export async function changePasscode(next: string): Promise<Result> {
  await requireManager()
  const code = String(next ?? '').trim()
  if (code.length < 4 || code.length > 64) return { ok: false, error: 'Passcode must be at least 4 characters.' }
  const jar = await cookies()
  const current = hashToken(jar.get(SESSION_COOKIE)?.value ?? '')
  await mutateStore((store) => {
    const salt = randomBytes(16).toString('hex')
    store.auth = { salt, hash: hashPasscode(code, salt), sessions: [current] }
  })
  return { ok: true }
}

function cleanNumber(value: unknown, allowNegative: boolean) {
  if (value === '' || value === null || value === undefined) return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || Math.abs(n) > 10_000) return undefined
  if (!allowNegative && n < 0) return undefined
  return Math.round(n * 100) / 100
}

export async function saveWeekScores(friday: string, entries: Record<string, Record<string, unknown>>): Promise<Result> {
  await requireManager()
  if (!isISODate(friday) || fridayOf(friday) !== friday) return { ok: false, error: 'Invalid week.' }

  await mutateStore((store) => {
    const ids = new Set(store.people.map((p) => p.id))
    const week: Record<string, Entry> = { ...(store.scores[friday] ?? {}) }
    for (const [id, raw] of Object.entries(entries ?? {})) {
      if (!ids.has(id)) continue
      const entry: Entry = {}
      for (const key of STAT_KEYS) {
        const v = cleanNumber(raw?.[key], key === 'bonus')
        if (v !== undefined) entry[key] = v
      }
      if (Object.keys(entry).length) week[id] = entry
      else delete week[id]
    }
    if (Object.keys(week).length) store.scores[friday] = week
    else delete store.scores[friday]
  })
  refreshAll()
  return { ok: true }
}

const cleanName = (name: unknown) => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
const cleanRole = (role: unknown): Role => (role === 'tech' ? 'tech' : 'asst')

export async function addPerson(name: string, role: Role): Promise<Result> {
  await requireManager()
  const clean = cleanName(name)
  if (!clean) return { ok: false, error: 'Enter a name.' }
  const result = await mutateStore((store) => {
    if (store.people.some((p) => p.active !== false && p.name.toLowerCase() === clean.toLowerCase())) return false
    store.people.push({ id: `p${Date.now().toString(36)}`, name: clean, role: cleanRole(role) })
    return true
  })
  if (!result) return { ok: false, error: 'That person is already on the roster.' }
  refreshAll()
  return { ok: true }
}

export async function updatePerson(id: string, name: string, role: Role): Promise<Result> {
  await requireManager()
  const clean = cleanName(name)
  if (!clean) return { ok: false, error: 'Enter a name.' }
  await mutateStore((store) => {
    const p = store.people.find((x) => x.id === id)
    if (p) {
      p.name = clean
      p.role = cleanRole(role)
    }
  })
  refreshAll()
  return { ok: true }
}

// Truck number for one person. Digits only; empty clears it (stored as ""
// so the seed backfill in readStore does not re-add it).
export async function setTruck(id: string, truck: string): Promise<Result> {
  await requireManager()
  const clean = String(truck ?? '').replace(/\D/g, '').slice(0, 6)
  await mutateStore((store) => {
    const p = store.people.find((x) => x.id === id)
    if (p) p.truck = clean
  })
  refreshAll()
  return { ok: true }
}

export async function removePerson(id: string): Promise<Result> {
  await requireManager()
  await mutateStore((store) => {
    const p = store.people.find((x) => x.id === id)
    if (p) p.active = false
  })
  refreshAll()
  return { ok: true }
}

export async function saveRules(rules: Partial<Rules>): Promise<Result> {
  await requireManager()
  await mutateStore((store) => {
    const next = { ...store.rules }
    for (const key of Object.keys(DEFAULT_RULES) as (keyof Rules)[]) {
      const n = Number(rules?.[key])
      if (Number.isFinite(n) && Math.abs(n) <= 1000) next[key] = n
    }
    store.rules = next
  })
  refreshAll()
  return { ok: true }
}

export async function saveSettings(input: { team1: string; team2: string; projection: string; jobsCompleted?: string; month: string }): Promise<Result> {
  await requireManager()
  await mutateStore((store) => {
    const t1 = cleanName(input.team1)
    const t2 = cleanName(input.team2)
    if (t1) store.settings.team1 = t1
    if (t2) store.settings.team2 = t2
    if (/^\d{4}-\d{2}$/.test(input.month)) {
      const n = Number(input.projection)
      if (input.projection === '') delete store.projections[input.month]
      else if (Number.isFinite(n) && n >= 0 && n < 100_000) store.projections[input.month] = Math.round(n)
      if (input.jobsCompleted !== undefined && input.jobsCompleted !== '') {
        const c = Number(input.jobsCompleted)
        if (Number.isFinite(c) && c >= 0 && c < 100_000) {
          if (!store.jobsCompleted) store.jobsCompleted = {}
          store.jobsCompleted[input.month] = Math.round(c)
        }
      }
    }
  })
  refreshAll()
  return { ok: true }
}

export async function redrawTeams(month: string): Promise<Result> {
  await requireManager()
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: 'Invalid month.' }
  await mutateStore((store) => {
    delete store.teams[month]
    store.redraw[month] = (store.redraw[month] ?? 0) + 1
  })
  refreshAll()
  return { ok: true }
}

export async function setTeam(month: string, personId: string, team: TeamKey): Promise<Result> {
  await requireManager()
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: 'Invalid month.' }
  const { teamsForMonth } = await import('@/lib/teams')
  await mutateStore((store) => {
    const current = teamsForMonth(store, month)
    if (!store.people.some((p) => p.id === personId)) return
    store.teams[month] = { ...current, [personId]: team === 'blue' ? 'blue' : 'red' }
  })
  refreshAll()
  return { ok: true }
}

export async function getStoreSnapshotForManager() {
  await requireManager()
  const store = await readStore()
  return { people: store.people.filter((p) => p.active !== false), rules: store.rules, settings: store.settings }
}

/**
 * Count one app view (a Board open). Called once per browser session from
 * the Board; any visitor counts, signed in or not — except the manager.
 * Kent's own opens are not counted: when the caller holds a valid manager
 * session (the showdown_manager cookie), the increment is skipped, so the
 * total reflects everyone else. Fire-and-forget: a failure here must never
 * break the Board load, and it does not revalidate any page.
 */
export async function recordView(): Promise<void> {
  try {
    if (await isManager()) return
    await incrementViews()
  } catch {
    // A failed count must never break the Board load.
  }
}

// --- Competitor sign-in -------------------------------------------------
// Each competitor signs in under their own name with a password they set
// themselves the first time. There is no manager step: the first sign-in
// for a name sets that person's password, later ones verify it. Kent can
// reset a forgotten password from Manage (resetCompetitorPasscode), which
// clears it so the person sets a new one next time they sign in.

export async function competitorSignIn(personId: string, passcode: string): Promise<Result> {
  const code = String(passcode ?? '').trim()
  if (code.length < 4 || code.length > 64) return { ok: false, error: 'Password must be at least 4 characters.' }

  // Verify BEFORE mutating, same as the manager sign-in: mutateStore
  // returns the store, not the callback's value, so a wrong password
  // checked inside the callback could never surface its error.
  const current = await readStore()
  const person = current.people.find((p) => p.id === personId && p.active !== false)
  if (!person) return { ok: false, error: 'Pick your name from the list.' }
  const creds = current.auth.competitors?.[personId]
  if (creds && !verifyPasscode(code, creds.salt, creds.hash)) {
    return { ok: false, error: 'That password is not correct.' }
  }

  const token = newSessionToken()
  await mutateStore(
    (store) => {
      if (!store.auth.competitors) store.auth.competitors = {}
      if (!store.auth.competitorSessions) store.auth.competitorSessions = {}
      if (!store.auth.competitors[personId]) {
        const salt = randomBytes(16).toString('hex')
        store.auth.competitors[personId] = { salt, hash: hashPasscode(code, salt) }
      }
      store.auth.competitorSessions[hashToken(token)] = personId
    },
    { preserveUpdatedAt: true },
  )

  await setCompetitorCookie(token)
  refreshAll()
  return { ok: true }
}

export async function competitorSignOut(): Promise<Result> {
  const jar = await cookies()
  const token = jar.get(COMPETITOR_COOKIE)?.value
  if (token) {
    const hashed = hashToken(token)
    await mutateStore(
      (store) => {
        if (store.auth.competitorSessions) delete store.auth.competitorSessions[hashed]
      },
      { preserveUpdatedAt: true },
    )
  }
  jar.delete(COMPETITOR_COOKIE)
  refreshAll()
  return { ok: true }
}

export async function changeCompetitorPasscode(next: string): Promise<Result> {
  const me = await requireCompetitor()
  const code = String(next ?? '').trim()
  if (code.length < 4 || code.length > 64) return { ok: false, error: 'Password must be at least 4 characters.' }
  const jar = await cookies()
  const current = hashToken(jar.get(COMPETITOR_COOKIE)?.value ?? '')
  await mutateStore(
    (store) => {
      const salt = randomBytes(16).toString('hex')
      if (!store.auth.competitors) store.auth.competitors = {}
      store.auth.competitors[me.id] = { salt, hash: hashPasscode(code, salt) }
      // Keep only this device signed in after a password change.
      if (store.auth.competitorSessions) {
        for (const [t, pid] of Object.entries(store.auth.competitorSessions)) {
          if (pid === me.id && t !== current) delete store.auth.competitorSessions[t]
        }
      }
    },
    { preserveUpdatedAt: true },
  )
  return { ok: true }
}

// Kent's recovery path for a forgotten competitor password: clears it (and
// that person's sessions) so they set a new one the next time they sign in.
export async function resetCompetitorPasscode(personId: string): Promise<Result> {
  await requireManager()
  await mutateStore(
    (store) => {
      if (store.auth.competitors) delete store.auth.competitors[personId]
      if (store.auth.competitorSessions) {
        for (const [t, pid] of Object.entries(store.auth.competitorSessions)) {
          if (pid === personId) delete store.auth.competitorSessions[t]
        }
      }
    },
    { preserveUpdatedAt: true },
  )
  refreshAll()
  return { ok: true }
}

// --- Comments & announcements -------------------------------------------
// The feed is chat, not scores: posting or deleting must not move the
// Board's "Live · updated" time, so every write here preserves it.

const cleanFeedText = (text: unknown) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 500)

export async function addComment(text: string): Promise<Result> {
  const me = await requireCompetitor()
  const clean = cleanFeedText(text)
  if (!clean) return { ok: false, error: 'Write something first.' }
  await mutateStore(
    (store) => {
      const list = store.comments ?? []
      list.unshift({ id: randomBytes(12).toString('hex'), personId: me.id, text: clean, createdAt: new Date().toISOString() })
      store.comments = list.slice(0, 200)
    },
    { preserveUpdatedAt: true },
  )
  refreshAll()
  return { ok: true }
}

export async function deleteComment(id: string): Promise<Result> {
  const manager = await isManager()
  const me = manager ? null : await getCompetitor()
  if (!manager && !me) return { ok: false, error: 'Sign in to delete a comment.' }
  await mutateStore(
    (store) => {
      const c = (store.comments ?? []).find((x) => x.id === id)
      if (!c) return
      if (!manager && c.personId !== me?.id) return
      store.comments = (store.comments ?? []).filter((x) => x.id !== id)
    },
    { preserveUpdatedAt: true },
  )
  refreshAll()
  return { ok: true }
}

export async function addAnnouncement(text: string): Promise<Result> {
  await requireManager()
  const clean = cleanFeedText(text)
  if (!clean) return { ok: false, error: 'Write something first.' }
  await mutateStore(
    (store) => {
      const list = store.announcements ?? []
      list.unshift({ id: randomBytes(12).toString('hex'), text: clean, createdAt: new Date().toISOString() })
      store.announcements = list.slice(0, 50)
    },
    { preserveUpdatedAt: true },
  )
  refreshAll()
  return { ok: true }
}

export async function deleteAnnouncement(id: string): Promise<Result> {
  await requireManager()
  await mutateStore(
    (store) => {
      store.announcements = (store.announcements ?? []).filter((x) => x.id !== id)
    },
    { preserveUpdatedAt: true },
  )
  refreshAll()
  return { ok: true }
}
