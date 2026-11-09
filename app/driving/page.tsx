import type { Metadata } from 'next'
import { DrivingBoard } from '@/components/board/driving-board'

export const metadata: Metadata = { title: 'Driving Scores · The Weekly Showdown' }

export default function Page() {
  return <DrivingBoard />
}
