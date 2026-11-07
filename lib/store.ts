import 'server-only'

import { promises as fs } from 'node:fs'
import path from 'node:path'

import seed from './seed.json'
import { DEFAULT_RULES } from './scoring'
import type { Store } from './types'

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
    auth: { sessions: [] },
    updatedAt: new Date().toISOString(),
  }
}

export async function readStore(): Promise<Store> {
  if (useKv) {
    try {
      const { kv } = await import('@vercel/kv')
      const stored = (await kv.get<Store>(KV_KEY)) ?? initialStore()
      // The stored document predates the view counter, so a missing views
      // value is 0 — never crash or reset scores when it is absent.
      // The stored rules also predate the bonus point values, so merge
      // DEFAULT_RULES underneath: new fields default to Kent's values
      // while any custom point values already stored are preserved.
      return {
        ...stored,
        rules: { ...DEFAULT_RULES, ...(stored.rules ?? {}) },
        views: typeof stored.views === 'number' ? stored.views : 0,
      }
    } catch {
      return initialStore()
    }
  }
  try {
    const raw = await fs.readFile(FILE, 'utf8')
    const stored = JSON.parse(raw) as Store
    return {
      ...stored,
      rules: { ...DEFAULT_RULES, ...(stored.rules ?? {}) },
      views: typeof stored.views === 'number' ? stored.views : 0,
    }
  } catch {
    return initialStore()
  }
}

let queue: Promise<unknown> = Promise.resolve()

export function mutateStore(
  fn: (store: Store) => void | Promise<void>,
): Promise<Store> {
  const task = queue.then(async () => {
    const store = await readStore()
    await fn(store)
    store.updatedAt = new Date().toISOString()
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
  const store = await mutateStore((s) => {
    s.views = (typeof s.views === 'number' ? s.views : 0) + 1
  })
  return store.views
}
