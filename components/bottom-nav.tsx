'use client'

import { BookOpen, Crown, Gauge, MessageSquareText, PencilLine, Settings2, Trophy } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const baseItems = [
  { href: '/', label: 'Board', icon: Trophy },
  { href: '/leaders', label: 'Leaders', icon: Crown },
  { href: '/driving', label: 'Driving', icon: Gauge },
  { href: '/comments', label: 'Smack Talk', icon: MessageSquareText },
  { href: '/rules', label: 'Rules', icon: BookOpen },
]

// Enter Scores and Manage only exist on the manager's view, once signed
// in. Everyone else — signed-out visitors and signed-in competitors —
// sees just the five tabs above.
const managerItems = [
  { href: '/enter', label: 'Enter Scores', icon: PencilLine },
  { href: '/manage', label: 'Manage', icon: Settings2 },
]

export function BottomNav({ isManager }: { isManager: boolean }) {
  const pathname = usePathname()
  const items = isManager ? [...baseItems, ...managerItems] : baseItems
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-3xl">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
