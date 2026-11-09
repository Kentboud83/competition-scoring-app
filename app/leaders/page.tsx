import type { Metadata } from 'next'
import { LeadersBoard } from '@/components/board/leaders-board'
import { requireAnySession } from '@/lib/auth'

export const metadata: Metadata = { title: 'Leaders · The Weekly Showdown' }

export default async function Page() {
  await requireAnySession()
  return <LeadersBoard />
}
