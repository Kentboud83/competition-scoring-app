import { Lock, User } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { getSessionState } from '@/lib/auth'
import { InstallButton } from './install-button'

export async function AppHeader() {
  const { competitor: me, isManager: manager } = await getSessionState()
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <Image src="/icon-192.png" alt="" width={36} height={36} className="rounded-lg" priority />
          <span className="flex flex-col leading-none">
            <span className="font-display text-xl font-bold uppercase tracking-wide">The Weekly Showdown</span>
            <span className="text-xs text-muted-foreground">Drive safe. Finish strong. Top the board.</span>
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/login"
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <User className="size-3.5" aria-hidden="true" />
            {me ? me.name.split(' ')[0] : 'Sign in'}
          </Link>
          {!manager && (
            <Link
              href="/manage"
              aria-label="Manager sign-in"
              title="Manager sign-in"
              className="flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <Lock className="size-4" aria-hidden="true" />
            </Link>
          )}
          <InstallButton />
        </div>
      </div>
    </header>
  )
}
