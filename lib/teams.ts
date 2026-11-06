import type { Person, Role, Store, TeamKey } from './types'

function hash(input: string) {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed: number) {
  let s = seed || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

const other = (t: TeamKey): TeamKey => (t === 'red' ? 'blue' : 'red')

/**
 * Balanced draw: within each role, people are paired in roster order and each
 * pair is split between the teams at random. An odd extra person alternates by month.
 */
function draw(people: Person[], month: string, code: number) {
  const random = rng(hash(`${month}#${code}`))
  const monthIndex = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7))
  const result: Record<string, TeamKey> = {}
  ;(['tech', 'asst'] as Role[]).forEach((role, roleIdx) => {
    const group = people.filter((p) => p.role === role)
    for (let i = 0; i < group.length; i += 2) {
      const first: TeamKey = random() < 0.5 ? 'red' : 'blue'
      if (group[i + 1]) {
        result[group[i].id] = first
        result[group[i + 1].id] = other(first)
      } else {
        result[group[i].id] = (monthIndex + roleIdx) % 2 === 0 ? 'red' : 'blue'
      }
    }
  })
  return result
}

export function teamsForMonth(store: Store, month: string) {
  const active = store.people.filter((p) => p.active !== false)
  const fixed = store.teams[month]
  if (!fixed) return draw(active, month, store.redraw[month] ?? 0)
  const result: Record<string, TeamKey> = {}
  for (const p of active) if (fixed[p.id]) result[p.id] = fixed[p.id]
  for (const p of active) {
    if (result[p.id]) continue
    const count = (t: TeamKey) => active.filter((q) => q.role === p.role && result[q.id] === t).length
    result[p.id] = count('red') <= count('blue') ? 'red' : 'blue'
  }
  return result
}
