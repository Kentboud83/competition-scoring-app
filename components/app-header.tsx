import Image from 'next/image'
import Link from 'next/link'
import { InstallButton } from './install-button'

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/icon-192.png" alt="" width={36} height={36} className="rounded-lg" priority />
          <span className="flex flex-col leading-none">
            <span className="font-display text-xl font-bold uppercase tracking-wide">The Weekly Showdown</span>
            <span className="text-xs text-muted-foreground">Drive safe. Finish strong. Top the board.</span>
          </span>
        </Link>
        <InstallButton />
      </div>
    </header>
  )
}
