import { NextResponse } from 'next/server'
import { getSessionState } from '@/lib/auth'
import { ensureVapidKeys } from '@/lib/push'

export const dynamic = 'force-dynamic'

// The VAPID public key, served to signed-in users so their browser can
// subscribe to push. The public key is public by design; the private key
// is never exposed anywhere.
export async function GET() {
  const session = await getSessionState()
  if (!session.competitor && !session.manager) {
    return NextResponse.json({ error: 'Sign-in required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  const keys = await ensureVapidKeys()
  return NextResponse.json({ publicKey: keys.publicKey }, { headers: { 'Cache-Control': 'no-store' } })
}
