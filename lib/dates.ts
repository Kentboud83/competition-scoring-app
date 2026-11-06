const DAY = 86_400_000

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function isISODate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parse(value))
}

/** Weeks run Monday–Sunday and are dated by their Friday. */
export function fridayOf(iso: string) {
  const ms = parse(iso)
  const weekday = ((new Date(ms).getUTCDay() + 6) % 7) + 1
  return fmt(ms - (weekday - 1) * DAY + 4 * DAY)
}

export function addDays(iso: string, days: number) {
  return fmt(parse(iso) + days * DAY)
}

export const monthOf = (friday: string) => friday.slice(0, 7)

export function prevMonth(month: string) {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

export function nextMonth(month: string) {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

const short = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const long = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function weekLabel(friday: string) {
  return `${short.format(parse(addDays(friday, -4)))}–${short.format(parse(addDays(friday, 2)))}`
}

export function monthLabel(month: string) {
  return long.format(parse(`${month}-01`))
}
