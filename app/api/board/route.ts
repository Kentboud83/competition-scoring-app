import { NextResponse, type NextRequest } from 'next/server'
import { hasAnySession } from '@/lib/auth'
import { computeBoard } from '@/lib/board'
import { isISODate, todayISO } from '@/lib/dates'
import { readStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Scores are visible only to signed-in competitors and the manager.
  if (!(await hasAnySession())) {
    return NextResponse.json({ error: 'Sign-in required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  const params = request.nextUrl.searchParams
  const date = params.get('date')
  const view = params.get('view') === 'week' ? 'week' : 'month'
  const store = await readStore()
  const start = store.settings.startDate
  let target = isISODate(date) ? date : todayISO()
  if (target < start) target = start
  const board = computeBoard(store, target, view)
  return NextResponse.json(board, { headers: { 'Cache-Control': 'no-store' } })
}
