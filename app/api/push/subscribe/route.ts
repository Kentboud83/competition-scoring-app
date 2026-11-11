import { NextResponse } from 'next/server'
import { getSessionState } from '@/lib/auth'
import { hasSubscription, ownerKeyFor, removeSubscription, saveSubscription } from '@/lib/push'

export const dynamic = 'force-dynamic'

async function who() {
  const session = await getSessionState()
  if (session.manager) return ownerKeyFor('', session.manager.id)
  if (session.competitor) return ownerKeyFor(session.competitor.id)
  return null
}

// Whether the signed-in person has a push subscription stored.
export async function GET() {
  const ownerKey = await who()
  if (!ownerKey) {
    return NextResponse.json({ error: 'Sign-in required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json({ subscribed: await hasSubscription(ownerKey) }, { headers: { 'Cache-Control': 'no-store' } })
}

// Save the browser's push subscription for the signed-in person.
export async function POST(req: Request) {
  const ownerKey = await who()
  if (!ownerKey) {
    return NextResponse.json({ error: 'Sign-in required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad subscription' }, { status: 400 })
  }
  const ok = await saveSubscription(ownerKey, (body as { subscription?: unknown })?.subscription ?? body)
  if (!ok) return NextResponse.json({ error: 'Bad subscription' }, { status: 400 })
  return NextResponse.json({ ok: true })
}

// Remove the browser's push subscription for the signed-in person.
export async function DELETE(req: Request) {
  const ownerKey = await who()
  if (!ownerKey) {
    return NextResponse.json({ error: 'Sign-in required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  let endpoint = ''
  try {
    endpoint = String((await req.json())?.endpoint ?? '')
  } catch {
    // No body: nothing to remove.
  }
  if (endpoint) await removeSubscription(ownerKey, endpoint)
  return NextResponse.json({ ok: true })
}
