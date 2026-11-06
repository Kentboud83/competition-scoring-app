import 'server-only'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { readStore } from './store'

export const SESSION_COOKIE = 'showdown_manager'

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

export async function isManager() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return false
  const store = await readStore()
  return store.auth.sessions.includes(hashToken(token))
}

export async function requireManager() {
  if (!(await isManager())) throw new Error('Manager sign-in required')
}
