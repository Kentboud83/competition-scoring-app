import type { Metadata } from 'next'
import { CommentsBoard } from '@/components/board/comments-board'
import { getCompetitor, isManager } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: "Comments & Smack Talkin' · The Weekly Showdown" }

export default async function Page() {
  const me = await getCompetitor()
  const manager = await isManager()
  return <CommentsBoard isManager={manager} me={me?.id ?? null} />
}
