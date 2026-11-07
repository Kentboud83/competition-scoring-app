import type { Metadata } from 'next'
import { LeadersBoard } from '@/components/board/leaders-board'

export const metadata: Metadata = { title: 'Leaders · The Weekly Showdown' }

export default function Page() {
  return <LeadersBoard />
}
