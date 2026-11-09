import type { Metadata } from 'next'
import { ManagerSignIn } from '@/components/manager-sign-in'
import { getSessionState } from '@/lib/auth'
import { MANAGERS } from '@/lib/managers'
import { readStore } from '@/lib/store'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Manager Sign-In · The Weekly Showdown' }

export default async function ManagerLoginPage() {
  const store = await readStore()
  const { manager } = await getSessionState()
  const hasPassword: Record<string, boolean> = {}
  for (const m of MANAGERS) hasPassword[m.id] = Boolean(store.auth.managers?.[m.id])
  return <ManagerSignIn hasPassword={hasPassword} signedInAs={manager} />
}
