'use client'

import { ArrowLeft, Mail, Send, SquarePen } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Participant = { key: string; name: string; team: 'red' | 'blue' | null; manager: boolean }

type Conversation = {
  other: Participant
  lastText: string
  lastCreatedAt: string
  lastFromMe: boolean
  unread: number
}

type ThreadMessage = { id: string; fromKey: string; text: string; createdAt: string; readAt?: string | null; mine: boolean }

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Failed to load')
    return r.json()
  })

// Short relative time: "just now", "5m ago", "2h ago", "Nov 9".
function timeAgo(iso: string) {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  if (Number.isNaN(then) || diff < 0) return ''
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function PersonDot({ p, className }: { p: Participant; className?: string }) {
  return (
    <span
      className={cn(
        'mt-1.5 size-2.5 shrink-0 rounded-full',
        p.manager ? 'bg-amber-400' : p.team === 'red' ? 'bg-team-red' : 'bg-team-blue',
        className,
      )}
      aria-hidden="true"
    />
  )
}

function ManagerTag() {
  return (
    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
      Manager
    </span>
  )
}

// Private 1:1 messages. The conversation list shows one row per person
// the viewer has messaged; tapping a row opens that thread. A thread is
// visible only to its two participants — the API enforces that, so the
// client never has to. Same 500-character limit as the feed, same
// 5-second refresh.
export function MessagesBoard() {
  const [selected, setSelected] = useState<Participant | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)
  // Messages I just sent, kept on screen until the thread refresh brings
  // them back with their real id — keyed by id so they never duplicate.
  const [sent, setSent] = useState<ThreadMessage[]>([])
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const {
    data: listData,
    error: listError,
    isLoading: listLoading,
    mutate: mutateList,
  } = useSWR<{ conversations: Conversation[]; totalUnread: number }>('/api/messages', fetcher, {
    refreshInterval: 5_000,
    revalidateOnFocus: true,
  })

  const threadUrl = selected ? `/api/messages?with=${encodeURIComponent(selected.key)}` : null
  const {
    data: threadData,
    mutate: mutateThread,
  } = useSWR<{ other: Participant; messages: ThreadMessage[] }>(threadUrl, fetcher, {
    refreshInterval: 5_000,
    revalidateOnFocus: true,
  })

  const { data: peopleData } = useSWR<{ people: Participant[] }>(
    showPicker ? '/api/messages?people=1' : null,
    fetcher,
  )

  const conversations = listData?.conversations ?? []

  // The thread, oldest first, plus anything I just sent that the refresh
  // hasn't returned yet (deduped by id).
  const shown = useMemo(() => {
    const real = threadData?.messages ?? []
    const ids = new Set(real.map((m) => m.id))
    const extra = sent.filter((m) => !ids.has(m.id))
    return [...real, ...extra].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [threadData, sent])

  // Opening a thread marks it read server-side; refresh the list so the
  // unread badge clears right away instead of on the next 5s tick.
  useEffect(() => {
    if (selected) mutateList()
  }, [selected, mutateList])

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [shown.length, selected?.key])

  const openConversation = (other: Participant) => {
    setSelected(other)
    setShowPicker(false)
    setSent([])
    setNotice('')
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    const clean = draft.trim()
    if (!clean) return
    setNotice('')
    setSending(true)
    const temp: ThreadMessage = {
      id: `temp-${Date.now()}`,
      fromKey: '',
      text: clean,
      createdAt: new Date().toISOString(),
      mine: true,
    }
    setSent((s) => [...s, temp])
    setDraft('')
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toKey: selected.key, text: clean }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string; message?: ThreadMessage } | null
      if (res.ok && data?.message) {
        // Swap the optimistic row for the real one, then refresh both
        // views so the conversation list picks up the new last message.
        setSent((s) => s.filter((m) => m.id !== temp.id).concat([data.message as ThreadMessage]))
        mutateThread()
        mutateList()
      } else {
        setSent((s) => s.filter((m) => m.id !== temp.id))
        setNotice(data?.error ?? 'Could not send that message.')
      }
    } catch {
      setSent((s) => s.filter((m) => m.id !== temp.id))
      setNotice('Something went wrong sending. Check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  // --- Thread view -------------------------------------------------------
  if (selected) {
    const other = threadData?.other ?? selected
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setSelected(null)} aria-label="Back to messages">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <PersonDot p={other} className="mt-0" />
            <p className="truncate text-lg font-semibold">{other.name}</p>
            {other.manager && <ManagerTag />}
          </div>
        </div>

        {notice && (
          <p role="status" className="rounded-lg bg-secondary px-3 py-2 text-sm">
            {notice}
          </p>
        )}

        <div className="flex flex-col gap-2" aria-label={`Conversation with ${other.name}`}>
          {shown.length === 0 ? (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
              No messages yet. Say hello — only the two of you can see this.
            </p>
          ) : (
            shown.map((m) => (
              <div key={m.id} className={cn('flex', m.mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3.5 py-2',
                    m.mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-card',
                  )}
                >
                  <p className="text-sm break-words">{m.text}</p>
                  <p className={cn('mt-0.5 text-right text-[10px]', m.mine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                    {timeAgo(m.createdAt)}
                    {/* Read receipt, on my own messages only: "Sent" until
                        the other person opens the thread, then "Read …"
                        once the server recorded readAt. */}
                    {m.mine && (m.readAt ? ` · Read ${timeAgo(m.readAt)}` : ' · Sent')}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={sendMessage} className="sticky bottom-24 flex gap-2 rounded-2xl border border-border bg-card p-3">
          <label htmlFor="dm-text" className="sr-only">
            Message {other.name}
          </label>
          <input
            id="dm-text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            placeholder={`Message ${other.name}…`}
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" size="lg" disabled={sending || !draft.trim()} aria-label="Send message">
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </form>
        <p className="text-right text-xs text-muted-foreground tabular-nums">{draft.length}/500</p>
      </div>
    )
  }

  // --- Conversation list ---------------------------------------------------
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Messages</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Private messages between you and your teammates — nobody else can see them.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowPicker((v) => !v)}
          aria-expanded={showPicker}
        >
          <SquarePen className="size-4" aria-hidden="true" />
          New message
        </Button>
      </div>

      {notice && (
        <p role="status" className="rounded-lg bg-secondary px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      {showPicker && (
        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Message someone
          </p>
          {!peopleData ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">Loading…</p>
          ) : peopleData.people.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">Nobody else to message yet.</p>
          ) : (
            <ul className="flex flex-col">
              {peopleData.people.map((p) => (
                <li key={p.key}>
                  <button
                    type="button"
                    onClick={() => openConversation(p)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-muted/60"
                  >
                    <PersonDot p={p} className="mt-0" />
                    <span className="font-semibold">{p.name}</span>
                    {p.manager && <ManagerTag />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {listLoading && conversations.length === 0 ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <div className="h-16 animate-pulse rounded-2xl bg-card" />
          <div className="h-16 animate-pulse rounded-2xl bg-card" />
          <div className="h-16 animate-pulse rounded-2xl bg-card" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Mail className="size-6" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold">No messages yet</p>
          <p className="text-sm text-muted-foreground">
            {listError
              ? 'Could not load your messages.'
              : 'Tap "New message" to send someone a private message.'}
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {conversations.map((c) => (
            <li key={c.other.key} className="overflow-hidden rounded-2xl border border-border bg-card">
              <button type="button" onClick={() => openConversation(c.other)} className="flex w-full items-start gap-3 px-4 py-3 text-left">
                <PersonDot p={c.other} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{c.other.name}</span>
                    {c.other.manager && <ManagerTag />}
                    <span className="text-xs text-muted-foreground">{timeAgo(c.lastCreatedAt)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                    {c.lastFromMe ? 'You: ' : ''}
                    {c.lastText}
                  </span>
                </span>
                {c.unread > 0 && (
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                    aria-label={`${c.unread} unread messages`}
                  >
                    {c.unread > 9 ? '9+' : c.unread}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
