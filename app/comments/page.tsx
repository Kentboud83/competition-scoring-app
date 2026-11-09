import type { Metadata } from 'next'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { CommentsBoard } from '@/components/board/comments-board'
import { buttonVariants } from '@/components/ui/button'
import { getCompetitor, isManager } from '@/lib/auth'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: "Comments & Smack Talkin' · The Weekly Showdown" }

// The feed is for the team only: competitors sign in under their own name,
// and the manager reads it with the manager sign-in. Signed-out visitors
// get the locked view — no feed, no composers — instead of the board.
export default async function Page() {
  const me = await getCompetitor()
  const manager = await isManager()
  if (!me && !manager) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Comments &amp; Smack Talkin&apos;</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The live feed — compliments, call-outs and smack talk from the team.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Lock className="size-6" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold">Sign in to see the feed</p>
          <p className="text-sm text-muted-foreground">
            Only the team can see what&apos;s said here. Pick your name and enter your password.
          </p>
          <Link href="/login" className={cn(buttonVariants({ size: 'lg' }))}>
            Sign in
          </Link>
        </div>
      </div>
    )
  }
  return <CommentsBoard isManager={manager} me={me?.id ?? null} />
}
