'use client'

import { Megaphone, Send, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import useSWR from 'swr'
import { addAnnouncement, addComment, deleteAnnouncement, deleteComment } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type FeedComment = {
  id: string
  personId: string
  name: string
  team: 'red' | 'blue'
  text: string
  createdAt: string
}

type FeedAnnouncement = { id: string; text: string; createdAt: string }

type Feed = { comments: FeedComment[]; announcements: FeedAnnouncement[] }

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Failed to load')
    return r.json() as Promise<Feed>
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

// Comments & Smack Talkin': the live feed. Announcements from Kent sit
// pinned at the top; below them, every signed-in competitor's comments,
// compliments and smack talk, newest first, refreshing on their own.
// Anyone can read; only signed-in competitors can post, and only Kent can
// post announcements. A comment's author (or Kent) can delete it.
export function CommentsBoard({ isManager, me }: { isManager: boolean; me: string | null }) {
  const { data, error, isLoading, mutate } = useSWR<Feed>('/api/comments', fetcher, {
    refreshInterval: 5_000,
    revalidateOnFocus: true,
  })
  const [pending, start] = useTransition()
  const [text, setText] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [notice, setNotice] = useState('')

  const postComment = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = text.trim()
    if (!clean) return
    setNotice('')
    start(async () => {
      try {
        const res = await addComment(clean)
        if (res.ok) {
          setText('')
          mutate()
        } else {
          setNotice(res.error)
        }
      } catch {
        setNotice('Something went wrong posting. Check your connection and try again.')
      }
    })
  }

  const postAnnouncement = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = announcement.trim()
    if (!clean) return
    setNotice('')
    start(async () => {
      try {
        const res = await addAnnouncement(clean)
        if (res.ok) {
          setAnnouncement('')
          mutate()
        } else {
          setNotice(res.error)
        }
      } catch {
        setNotice('Something went wrong posting. Check your connection and try again.')
      }
    })
  }

  const removeComment = (id: string) => {
    start(async () => {
      try {
        await deleteComment(id)
        mutate()
      } catch {
        setNotice('Could not delete that comment.')
      }
    })
  }

  const removeAnnouncement = (id: string) => {
    start(async () => {
      try {
        await deleteAnnouncement(id)
        mutate()
      } catch {
        setNotice('Could not delete that announcement.')
      }
    })
  }

  const comments = data?.comments ?? []
  const announcements = data?.announcements ?? []

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Comments &amp; Smack Talkin&apos;</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compliments, call-outs and smack talk from the team — just for the team.
        </p>
      </div>

      {notice && (
        <p role="status" className="rounded-lg bg-secondary px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      {isManager && (
        <form onSubmit={postAnnouncement} className="flex flex-col gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <label htmlFor="announcement" className="flex items-center gap-2 text-sm font-semibold">
            <Megaphone className="size-4 text-amber-400" aria-hidden="true" />
            Post an announcement
          </label>
          <div className="flex gap-2">
            <input
              id="announcement"
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              maxLength={500}
              placeholder="Something the whole team needs to hear…"
              className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" size="lg" disabled={pending || !announcement.trim()}>
              Post
            </Button>
          </div>
        </form>
      )}

      {announcements.length > 0 && (
        <section aria-label="Announcements" className="flex flex-col gap-2">
          {announcements.map((a) => (
            <article key={a.id} className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
              <Megaphone className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
                  Announcement · {timeAgo(a.createdAt)}
                </p>
                <p className="mt-0.5 text-sm">{a.text}</p>
              </div>
              {isManager && (
                <button
                  type="button"
                  onClick={() => removeAnnouncement(a.id)}
                  disabled={pending}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                  aria-label="Delete announcement"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </article>
          ))}
        </section>
      )}

      {me ? (
        <form onSubmit={postComment} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
          <label htmlFor="comment" className="text-sm font-semibold">
            Say it
          </label>
          <textarea
            id="comment"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Compliment, call-out, or smack talk…"
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">{text.length}/500</span>
            <Button type="submit" disabled={pending || !text.trim()} className="gap-1.5">
              <Send className="size-4" aria-hidden="true" />
              Post
            </Button>
          </div>
        </form>
      ) : (
        <p className="rounded-2xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
          You&apos;re signed in as manager — you can read the feed and post announcements above.
        </p>
      )}

      {isLoading && comments.length === 0 ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <div className="h-16 animate-pulse rounded-2xl bg-card" />
          <div className="h-16 animate-pulse rounded-2xl bg-card" />
          <div className="h-16 animate-pulse rounded-2xl bg-card" />
        </div>
      ) : comments.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-center text-muted-foreground">
          {error ? 'Could not load the feed.' : 'No smack talk yet. Start it.'}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <span
                className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', c.team === 'red' ? 'bg-team-red' : 'bg-team-blue')}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
                </p>
                <p className="mt-0.5 text-sm break-words">{c.text}</p>
              </div>
              {(isManager || c.personId === me) && (
                <button
                  type="button"
                  onClick={() => removeComment(c.id)}
                  disabled={pending}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete comment from ${c.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
