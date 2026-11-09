import 'server-only'

import { promises as fs } from 'node:fs'
import path from 'node:path'

import seed from './seed.json'
import { DEFAULT_RULES } from './scoring'
import type { Person, Store } from './types'

const KV_KEY = 'weekly-showdown'
const useKv = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
)
const FILE = process.env.VERCEL
  ? '/tmp/weekly-showdown.json'
  : path.join(process.cwd(), '.data', 'weekly-showdown.json')

function initialStore(): Store {
  return {
    settings: seed.settings,
    rules: { ...DEFAULT_RULES },
    people: seed.people as Store['people'],
    teams: seed.teams as Store['teams'],
    redraw: { '2026-11': 7 },
    scores: seed.scores as Store['scores'],
    projections: seed.projections,
    jobsCompleted: {},
    views: 0,
    comments: [],
    announcements: [],
    auth: { sessions: [], competitors: {}, competitorSessions: {} },
    updatedAt: new Date().toISOString(),
  }
}

// The stored document predates the view counter, the comments feed and
// competitor logins, so normalize anything missing instead of crashing or
// resetting scores when a field is absent. The stored rules also predate
// the bonus point values, so merge DEFAULT_RULES underneath: new fields
// default to Kent's values while any custom point values already stored
// are preserved.
function normalizeStore(stored: Store): Store {
  return {
    ...stored,
    people: withTrucks(stored.people),
    rules: { ...DEFAULT_RULES, ...(stored.rules ?? {}) },
    views: typeof stored.views === 'number' ? stored.views : 0,
    comments: Array.isArray(stored.comments) ? stored.comments : [],
    announcements: Array.isArray(stored.announcements) ? stored.announcements : [],
    auth: {
      ...(stored.auth ?? { sessions: [] }),
      sessions: Array.isArray(stored.auth?.sessions) ? stored.auth.sessions : [],
      competitors: stored.auth?.competitors ?? {},
      competitorSessions: stored.auth?.competitorSessions ?? {},
    },
  }
}

export async function readStore(): Promise<Store> {
  if (useKv) {
    try {
      const { kv } = await import('@vercel/kv')
      const stored = (await kv.get<Store>(KV_KEY)) ?? initialStore()
      return normalizeStore(stored)
    } catch {
      return initialStore()
    }
  }
  try {
    const raw = await fs.readFile(FILE, 'utf8')
    const stored = JSON.parse(raw) as Store
    return normalizeStore(stored)
  } catch {
    return initialStore()
  }
}

// Truck numbers live on the seed roster. The live store predates the truck
// field, so anyone without one gets the seed value (matched by id) —
// this is how the truck numbers reach the live app, since the
// Vercel-managed database's data browser is read-only and cannot be
// edited directly. A truck set in the live store always wins; a truck
// deliberately cleared there is stored as "" and is never re-filled.
const seedTrucks = new Map(
  (seed.people as { id: string; truck?: string }[]).filter((p) => p.truck).map((p) => [p.id, p.truck as string]),
)

function withTrucks(people: Person[]): Person[] {
  return people.map((p) => (p.truck === undefined && seedTrucks.has(p.id) ? { ...p, truck: seedTrucks.get(p.id) } : p))
}

let queue: Promise<unknown> = Promise.resolve()

export function mutateStore(
  fn: (store: Store) => void | Promise<void>,
  opts?: { preserveUpdatedAt?: boolean },
): Promise<Store> {
  const task = queue.then(async () => {
    const store = await readStore()
    await fn(store)
    // Normally a write stamps the Board's "updated" time. A caller that
    // only records a view can opt out: merely opening the app must not
    // move the "Live · updated" time, which should reflect the last
    // score or settings change.
    if (!opts?.preserveUpdatedAt) {
      store.updatedAt = new Date().toISOString()
    }
    if (useKv) {
      const { kv } = await import('@vercel/kv')
      await kv.set(KV_KEY, store)
    } else {
      await fs.mkdir(path.dirname(FILE), { recursive: true })
      await fs.writeFile(FILE, JSON.stringify(store))
    }
    return store
  })
  queue = task.catch(() => {})
  return task
}

export async function incrementViews(): Promise<number> {
  const store = await mutateStore(
    (s) => {
      s.views = (typeof s.views === 'number' ? s.views : 0) + 1
    },
    // A view is not a score change: count it without moving the Board's
    // "updated" time (see mutateStore).
    { preserveUpdatedAt: true },
  )
  return store.views
}
