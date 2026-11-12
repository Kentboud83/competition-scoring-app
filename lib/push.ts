import 'server-only'

import { generateVAPIDKeys, sendNotification, setVapidDetails } from 'web-push'
import { mutateStore, readStore } from '@/lib/store'
import type { PushSubscriptionRecord } from '@/lib/types'

// Web Push for the Smack Talk feed: when someone posts a comment (or a
// reply) or a manager posts an announcement, every subscribed teammate
// gets a push — except the author.
//
// VAPID keys: the pair is generated once, on first use, and stored in the
// KV store under `store.push` (server-only — the private key is never
// exposed through any API route or client payload, and it is never
// committed to git). Only the public key is served, to signed-in users,
// so their browser can subscribe. The pair lives and dies with the store:
// if the store were ever reset, everyone would simply re-subscribe and a
// fresh pair would be generated. Ideally the keys move to Vercel env vars
// later; the store keeps the feature working with no manual setup now.
const VAPID_SUBJECT = 'https://competition-scoring-app-kv.vercel.app'

export type VapidKeys = { publicKey: string; privateKey: string }

export async function ensureVapidKeys(): Promise<VapidKeys> {
  const store = await readStore()
  if (store.push?.vapidPublicKey && store.push?.vapidPrivateKey) {
    return { publicKey: store.push.vapidPublicKey, privateKey: store.push.vapidPrivateKey }
  }
  const keys = generateVAPIDKeys()
  await mutateStore(
    (s) => {
      s.push = {
        ...(s.push ?? {}),
        vapidPublicKey: keys.publicKey,
        vapidPrivateKey: keys.privateKey,
        subscriptions: Array.isArray(s.push?.subscriptions) ? s.push.subscriptions : [],
      }
    },
    { preserveUpdatedAt: true },
  )
  return keys
}

/** Who a subscription belongs to, for excluding the author from their own post's notifications. */
export function ownerKeyFor(personId: string, managerId?: string): string {
  return managerId ? `manager:${managerId}` : `person:${personId}`
}

function isGone(err: unknown): boolean {
  const status = (err as { statusCode?: number })?.statusCode
  return status === 404 || status === 410
}

// Send one payload to a list of subscriptions, pruning the ones the push
// service reports as gone (404/410). Never throws.
async function sendTo(targets: PushSubscriptionRecord[], payload: string): Promise<void> {
  if (targets.length === 0) return
  const keys = await ensureVapidKeys()
  setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey)
  const results = await Promise.allSettled(
    targets.map((sub) =>
      sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys } as Parameters<typeof sendNotification>[0],
        payload,
      ),
    ),
  )
  const gone = targets.filter((_, i) => {
    const r = results[i]
    return r.status === 'rejected' && isGone(r.reason)
  })
  if (gone.length > 0) {
    const goneEndpoints = new Set(gone.map((g) => g.endpoint))
    await mutateStore(
      (s) => {
        s.push = {
          ...(s.push ?? {}),
          subscriptions: (s.push?.subscriptions ?? []).filter((x) => !goneEndpoints.has(x.endpoint)),
        }
      },
      { preserveUpdatedAt: true },
    )
  }
}

// Send a push to every subscriber except the author. Never throws and
// never blocks the caller: a failed push must not fail the comment post.
// Subscriptions the push service reports as gone (404/410) are pruned.
export async function notifyFeedPost(opts: {
  authorKey: string
  title: string
  body: string
}): Promise<void> {
  try {
    const store = await readStore()
    const subs = store.push?.subscriptions ?? []
    const targets = subs.filter((s) => s.ownerKey !== opts.authorKey)
    if (targets.length === 0) return
    const payload = JSON.stringify({ title: opts.title, body: opts.body, url: '/comments' })
    await sendTo(targets, payload)
  } catch (err) {
    // Push is best-effort: log and move on, the post itself already saved.
    console.error('[showdown-push] notify failed', err instanceof Error ? err.message : err)
  }
}

// Send a push to ONE person only: the recipient of a private direct
// message. Nobody else is notified, and the payload carries no message
// content beyond a short preview. Same best-effort discipline as the
// feed: never throws, never blocks the send.
export async function notifyDirectMessage(opts: {
  recipientKey: string
  title: string
  body: string
}): Promise<void> {
  try {
    const store = await readStore()
    const subs = store.push?.subscriptions ?? []
    const targets = subs.filter((s) => s.ownerKey === opts.recipientKey)
    if (targets.length === 0) return
    const payload = JSON.stringify({ title: opts.title, body: opts.body, url: '/messages' })
    await sendTo(targets, payload)
  } catch (err) {
    console.error('[showdown-push] notify failed', err instanceof Error ? err.message : err)
  }
}

export async function saveSubscription(ownerKey: string, sub: unknown): Promise<boolean> {
  const rec = sub as Partial<PushSubscriptionRecord> | null
  if (
    !rec ||
    typeof rec.endpoint !== 'string' ||
    !rec.keys ||
    typeof rec.keys.p256dh !== 'string' ||
    typeof rec.keys.auth !== 'string'
  ) {
    return false
  }
  const record: PushSubscriptionRecord = {
    ownerKey,
    endpoint: rec.endpoint,
    keys: { p256dh: rec.keys.p256dh, auth: rec.keys.auth },
    createdAt: new Date().toISOString(),
  }
  await mutateStore(
    (s) => {
      const list = s.push?.subscriptions ?? []
      const rest = list.filter((x) => x.endpoint !== record.endpoint)
      rest.push(record)
      s.push = { ...(s.push ?? {}), subscriptions: rest }
    },
    { preserveUpdatedAt: true },
  )
  return true
}

export async function removeSubscription(ownerKey: string, endpoint: string): Promise<void> {
  await mutateStore(
    (s) => {
      s.push = {
        ...(s.push ?? {}),
        subscriptions: (s.push?.subscriptions ?? []).filter((x) => !(x.endpoint === endpoint && x.ownerKey === ownerKey)),
      }
    },
    { preserveUpdatedAt: true },
  )
}

export async function hasSubscription(ownerKey: string): Promise<boolean> {
  const store = await readStore()
  return (store.push?.subscriptions ?? []).some((x) => x.ownerKey === ownerKey)
}
