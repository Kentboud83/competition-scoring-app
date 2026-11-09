import type { Metadata } from 'next'
import { DrivingBoard } from '@/components/board/driving-board'
import { requireAnySession } from '@/lib/auth'

export const metadata: Metadata = { title: 'Driving Scores · The Weekly Showdown' }

export default async function Page() {
  await requireAnySession()
  return <DrivingBoard />
}
