import type { Metadata } from 'next'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { MessagesBoard } from '@/components/board/messages-board'
import { buttonVariants } from '@/components/ui/button'
import { getCompetitor, isManager } from '@/lib/auth'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Messages · The Weekly Showdown' }

// Private messages between signed-in teammates — 1:1 and groups. Signed-out visitors
// get the locked view — no conversations, no names — instead of the inbox.
export default async function Page() {
  const me = await getCompetitor()
  const manager = await isManager()
  if (!me && !manager) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Messages</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Private messages between you and your teammates — one-to-one or group, nobody else can see them.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Lock className="size-6" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold">Sign in to see your messages</p>
          <p className="text-sm text-muted-foreground">
            Only you can see your conversations. Pick your name and enter your password.
          </p>
          <Link href="/login" className={cn(buttonVariants({ size: 'lg' }))}>
            Sign in
          </Link>
        </div>
      </div>
    )
  }
  return <MessagesBoard />
}
