import { LiveBoard } from '@/components/board/live-board'
import { requireAnySession } from '@/lib/auth'

export default async function Page() {
  await requireAnySession()
  return <LiveBoard />
}
