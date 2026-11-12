'use client'

import { Megaphone, MessageSquareReply, Pencil, Send, Trash2 } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'
import useSWR from 'swr'
import { addAnnouncement, addComment, deleteAnnouncement, deleteComment } from '@/app/actions'
import { PushToggle } from '@/components/board/push-toggle'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type FeedComment = {
  id: string
  personId: string
  name: string
  team: 'red' | 'blue' | null
  manager: boolean
  mine: boolean
  text: string
  createdAt: string
  editedAt?: string
  parentId: string | null
}

type FeedAnnouncement = { id: string; text: string; createdAt: string; editedAt?: string; name: string; mine: boolean }

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

// Comments & Smack Talkin': the live feed. Announcements from the managers
// sit pinned at the top in their own highlighted cards, and they also show
// in the feed itself in chronological order, marked as announcements — one
// post, shown twice, never notified twice. Below them, every signed-in
// competitor's — and manager's — comments, compliments and smack talk,
// newest first, refreshing on their own. A manager's comment shows their
// name with a Manager tag and no team dot. Any comment can be replied to:
// replies thread one level deep under the comment they answer, newest first
// in the thread. A comment's author (or any manager) can delete it, and
// deleting a comment takes its replies with it. Only the author can edit
// a comment — or an announcement — in place; the edited text keeps its
// original spot and shows an "(edited)" marker. (Delete stays author or
// any manager; editing does not.)
export function CommentsBoard({ isManager, me }: { isManager: boolean; me: string | null }) {
  const { data, error, isLoading, mutate } = useSWR<Feed>('/api/comments', fetcher, {
    refreshInterval: 5_000,
    revalidateOnFocus: true,
  })
  const [pending, start] = useTransition()
  const [text, setText] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [notice, setNotice] = useState('')
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null)
  const [replyText, setReplyText] = useState('')
  // The one comment or announcement being edited inline, if any.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingKind, setEditingKind] = useState<'comment' | 'announcement'>('comment')
  const [editText, setEditText] = useState('')

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

  const postReply = (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyingTo) return
    const clean = replyText.trim()
    if (!clean) return
    setNotice('')
    start(async () => {
      try {
        const res = await addComment(clean, replyingTo.id)
        if (res.ok) {
          setReplyText('')
          setReplyingTo(null)
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

  const startEditing = (id: string, kind: 'comment' | 'announcement', text: string) => {
    setEditingId(id)
    setEditingKind(kind)
    setEditText(text)
    setNotice('')
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditText('')
  }

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    const clean = editText.trim()
    if (!clean) return
    setNotice('')
    start(async () => {
      try {
        const res = await fetch('/api/comments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, kind: editingKind, text: clean }),
        })
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        if (res.ok) {
          setEditingId(null)
          setEditText('')
          mutate()
        } else {
          setNotice(data?.error ?? 'Could not save that edit.')
        }
      } catch {
        setNotice('Something went wrong saving. Check your connection and try again.')
      }
    })
  }

  // The inline editor shown in place of a comment's (or announcement's)
  // text while it is being edited: same 500-character limit as posting.
  const editForm = (
    <form onSubmit={saveEdit} className="mt-1 flex flex-col gap-1.5">
      <textarea
        autoFocus
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        maxLength={500}
        rows={2}
        aria-label="Edit comment"
        className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">{editText.length}/500</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={cancelEditing}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending || !editText.trim()}>
            Save
          </Button>
        </div>
      </div>
    </form>
  )

  const comments = data?.comments ?? []
  const announcements = data?.announcements ?? []

  // Top-level feed, newest first: top-level comments and announcements
  // interleaved by time. Replies hang under their parent, newest first in
  // the thread. A reply whose parent fell out of the 200-item cap has
  // nowhere to hang, so it is not shown.
  const feed = useMemo(() => {
    const byId = new Map(comments.map((c) => [c.id, c]))
    const top = comments.filter((c) => !c.parentId)
    const replies = new Map<string, FeedComment[]>()
    for (const c of comments) {
      if (!c.parentId) continue
      if (!byId.has(c.parentId)) continue
      const list = replies.get(c.parentId) ?? []
      list.push(c)
      replies.set(c.parentId, list)
    }
    type Item =
      | { kind: 'comment'; at: string; comment: FeedComment }
      | { kind: 'announcement'; at: string; announcement: FeedAnnouncement }
    const items: Item[] = [
      ...top.map((c) => ({ kind: 'comment' as const, at: c.createdAt, comment: c })),
      ...announcements.map((a) => ({ kind: 'announcement' as const, at: a.createdAt, announcement: a })),
    ]
    items.sort((a, b) => b.at.localeCompare(a.at))
    return { items, replies }
  }, [comments, announcements])

  const commentCard = (c: FeedComment, inThread: boolean) => (
    <div className={cn('flex items-start gap-3 px-4 py-3', inThread && 'border-t border-border/60 bg-muted/30')}>
      <span
        className={cn(
          'mt-1.5 size-2.5 shrink-0 rounded-full',
          c.manager ? 'bg-amber-400' : c.team === 'red' ? 'bg-team-red' : 'bg-team-blue',
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold">{c.name}</span>
          {c.manager && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
              Manager
            </span>
          )}
          <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
          {c.editedAt && <span className="text-xs italic text-muted-foreground">(edited)</span>}
        </p>
        {editingId === c.id && editingKind === 'comment' ? (
          editForm
        ) : (
          <p className="mt-0.5 text-sm break-words">{c.text}</p>
        )}
        {!inThread && !(editingId === c.id && editingKind === 'comment') && (
          <div className="mt-1.5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setReplyingTo({ id: c.id, name: c.name })
                setReplyText('')
              }}
              disabled={pending}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <MessageSquareReply className="size-3.5" aria-hidden="true" />
              Reply
            </button>
            {(feed.replies.get(c.id)?.length ?? 0) > 0 && (
              <span className="text-xs text-muted-foreground">
                {feed.replies.get(c.id)!.length} {feed.replies.get(c.id)!.length === 1 ? 'reply' : 'replies'}
              </span>
            )}
          </div>
        )}
      </div>
      {(c.mine || isManager || c.personId === me) && (
        <div className="flex shrink-0 items-center">
          {c.mine && (
            <button
              type="button"
              onClick={() => startEditing(c.id, 'comment', c.text)}
              disabled={pending}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
              aria-label={`Edit comment from ${c.name}`}
            >
              <Pencil className="size-4" />
            </button>
          )}
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
        </div>
      )}
    </div>
  )

  // Announcements render twice — pinned at the top and in the feed in
  // chronological order — from the same array. Any manager can delete
  // them from either spot; only the manager who posted one can edit it.
  const announcementCard = (a: FeedAnnouncement) => (
    <article className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <Megaphone className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs font-semibold uppercase tracking-wide text-amber-400">
          <span>
            Announcement · {a.name} · {timeAgo(a.createdAt)}
          </span>
          {a.editedAt && <span className="normal-case italic text-amber-400/70">(edited)</span>}
        </p>
        {editingId === a.id && editingKind === 'announcement' ? (
          editForm
        ) : (
          <p className="mt-0.5 text-sm">{a.text}</p>
        )}
      </div>
      {(a.mine || isManager) && (
        <div className="flex shrink-0 items-center">
          {a.mine && (
            <button
              type="button"
              onClick={() => startEditing(a.id, 'announcement', a.text)}
              disabled={pending}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
              aria-label="Edit announcement"
            >
              <Pencil className="size-4" />
            </button>
          )}
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
        </div>
      )}
    </article>
  )

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

      <PushToggle />

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
            <div key={a.id}>{announcementCard(a)}</div>
          ))}
        </section>
      )}

      {me || isManager ? (
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
          Sign in to join the conversation.
        </p>
      )}

      {isLoading && feed.items.length === 0 ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <div className="h-16 animate-pulse rounded-2xl bg-card" />
          <div className="h-16 animate-pulse rounded-2xl bg-card" />
          <div className="h-16 animate-pulse rounded-2xl bg-card" />
        </div>
      ) : feed.items.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-center text-muted-foreground">
          {error ? 'Could not load the feed.' : 'No smack talk yet. Start it.'}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {feed.items.map((item) =>
            item.kind === 'announcement' ? (
              <li key={`a-${item.announcement.id}`}>{announcementCard(item.announcement)}</li>
            ) : (
              <li key={item.comment.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                {commentCard(item.comment, false)}
                {(feed.replies.get(item.comment.id) ?? []).length > 0 && (
                  <div className="ml-6 flex flex-col border-l-2 border-border/70 pl-2">
                    {feed.replies.get(item.comment.id)!.map((r) => (
                      <div key={r.id}>{commentCard(r, true)}</div>
                    ))}
                  </div>
                )}
                {replyingTo?.id === item.comment.id && (
                  <form onSubmit={postReply} className="border-t border-border/60 bg-muted/30 px-4 py-3">
                    <label htmlFor="reply" className="text-xs font-semibold text-muted-foreground">
                      Replying to {replyingTo.name}
                    </label>
                    <div className="mt-1.5 flex gap-2">
                      <input
                        id="reply"
                        autoFocus
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        maxLength={500}
                        placeholder={`Reply to ${replyingTo.name}…`}
                        className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <Button type="submit" disabled={pending || !replyText.trim()}>
                        Reply
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          setReplyingTo(null)
                          setReplyText('')
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  )
}
