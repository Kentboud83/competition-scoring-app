import 'server-only'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import seed from './seed.json'
import { DEFAULT_RULES } from './scoring'
import type { Store } from './types'

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
    auth: { sessions: [] },
    updatedAt: new Date().toISOString(),
  }
}

export async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(FILE, 'utf8')
    return JSON.parse(raw) as Store
  } catch {
    return initialStore()
  }
}

let queue: Promise<unknown> = Promise.resolve()

/** Serializes writes so concurrent saves never clobber each other. */
export function mutateStore<T>(fn: (store: Store) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const store = await readStore()
    const result = await fn(store)
    store.updatedAt = new Date().toISOString()
    await fs.mkdir(path.dirname(FILE), { recursive: true })
    const tmp = `${FILE}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(store))
    await fs.rename(tmp, FILE)
    return result
  })
  queue = run.catch(() => undefined)
  return run
}
