'use client'

import { BookOpen, Crown, Gauge, Mail, MessageSquareText, PencilLine, Settings2, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { cn } from '@/lib/utils'

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: 'messages' }

const baseItems: NavItem[] = [
  { href: '/', label: 'Board', icon: Trophy },
  { href: '/leaders', label: 'Leaders', icon: Crown },
  { href: '/driving', label: 'Driving', icon: Gauge },
  { href: '/comments', label: 'Smack Talk', icon: MessageSquareText },
  { href: '/messages', label: 'Messages', icon: Mail, badge: 'messages' },
  { href: '/rules', label: 'Rules', icon: BookOpen },
]

// Enter Scores and Manage only exist on the manager's view, once signed
// in. Everyone else — signed-out visitors and signed-in competitors —
// sees just the five tabs above.
const managerItems: NavItem[] = [
  { href: '/enter', label: 'Enter Scores', icon: PencilLine },
  { href: '/manage', label: 'Manage', icon: Settings2 },
]

export function BottomNav({ isManager }: { isManager: boolean }) {
  const pathname = usePathname()
  const items = isManager ? [...baseItems, ...managerItems] : baseItems
  // Total unread private messages for the badge on the Messages tab.
  // A 401 (or any failure) just means no badge — the tab still works.
  const { data: dmData } = useSWR<{ totalUnread: number }>(
    '/api/messages',
    (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)),
    { refreshInterval: 15_000, revalidateOnFocus: true },
  )
  const unread = dmData?.totalUnread ?? 0
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-3xl">
        {items.map(({ href, label, icon: Icon, badge }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          const showBadge = badge === 'messages' && unread > 0
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
                {showBadge && (
                  <span
                    className="absolute right-1/2 top-1 flex h-4 min-w-4 translate-x-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
                    aria-label={`${unread} unread messages`}
                  >
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
