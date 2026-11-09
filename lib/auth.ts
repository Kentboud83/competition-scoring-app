import 'server-only'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { readStore } from './store'

export const SESSION_COOKIE = 'showdown_manager'
export const COMPETITOR_COOKIE = 'showdown_competitor'

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
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return false
  const store = await readStore()
  return store.auth.sessions.includes(hashToken(token))
}

export async function requireManager() {
  if (!(await isManager())) throw new Error('Manager sign-in required')
}

export type CompetitorSession = { id: string; name: string } | null

// Who is signed in as a competitor, if anyone. The cookie holds a random
// token; the store maps its hash to a person id.
export async function getCompetitor(): Promise<CompetitorSession> {
  const token = (await cookies()).get(COMPETITOR_COOKIE)?.value
  if (!token) return null
  const store = await readStore()
  const personId = store.auth.competitorSessions?.[hashToken(token)]
  if (!personId) return null
  const person = store.people.find((p) => p.id === personId && p.active !== false)
  if (!person) return null
  return { id: person.id, name: person.name }
}

export async function requireCompetitor() {
  const me = await getCompetitor()
  if (!me) throw new Error('Competitor sign-in required')
  return me
}
