import 'server-only'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { MANAGERS, type ManagerId } from './managers'
import { readStore } from './store'

export const SESSION_COOKIE = 'showdown_manager'
export const COMPETITOR_COOKIE = 'showdown_competitor'

export type ManagerSession = { id: ManagerId; name: string; title: string } | null

export const hashPasscode = (passcode: string, salt: string) => scryptSync(passcode, salt, 32).toString('hex')

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export function verifyPasscode(passcode: string, salt: string, expected: string) {
  const a = Buffer.from(hashPasscode(passcode, salt), 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function newSessionToken() {
  return randomBytes(32).toString('hex')
}

export async function setSessionCookie(token: string) {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  })
}

export async function setCompetitorCookie(token: string) {
  const jar = await cookies()
  jar.set(COMPETITOR_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  })
}

export async function isManager() {
  return (await getSessionState()).isManager
}

export async function requireManager() {
  if (!(await isManager())) throw new Error('Manager sign-in required')
}

export type CompetitorSession = { id: string; name: string } | null

// One store read for both sessions: who is signed in as a competitor, and
// which manager is signed in. Every session check in the app goes through
// this, so a page never has to read the store twice to decide.
export async function getSessionState(): Promise<{
  competitor: CompetitorSession
  manager: ManagerSession
  isManager: boolean
}> {
  const jar = await cookies()
  const store = await readStore()
  let competitor: CompetitorSession = null
  const comp = jar.get(COMPETITOR_COOKIE)?.value
  if (comp) {
    const pid = store.auth.competitorSessions?.[hashToken(comp)]
    const person = pid ? store.people.find((p) => p.id === pid && p.active !== false) : undefined
    if (person) competitor = { id: person.id, name: person.name }
  }
  let manager: ManagerSession = null
  const mgr = jar.get(SESSION_COOKIE)?.value
  if (mgr) {
    const mid = store.auth.managerSessions?.[hashToken(mgr)]
    const entry = mid ? MANAGERS.find((m) => m.id === mid) : undefined
    if (entry) manager = { id: entry.id, name: entry.name, title: entry.title }
  }
  return { competitor, manager, isManager: manager !== null }
}

// Who is signed in as a competitor, if anyone. The cookie holds a random
// token; the store maps its hash to a person id.
export async function getCompetitor(): Promise<CompetitorSession> {
  return (await getSessionState()).competitor
}

export async function requireCompetitor() {
  const me = await getCompetitor()
  if (!me) throw new Error('Competitor sign-in required')
  return me
}

// Does the visitor hold any valid session — competitor or manager? The
// whole app sits behind a sign-in: the Board, Leaders, Driving and Rules
// pages send signed-out visitors to /login, and the board API refuses
// them, so no content is visible before signing in.
export async function hasAnySession(): Promise<boolean> {
  const s = await getSessionState()
  return s.competitor !== null || s.isManager
}

export async function requireAnySession(): Promise<void> {
  if (!(await hasAnySession())) redirect('/login')
}
