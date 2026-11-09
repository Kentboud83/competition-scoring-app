import type { ManagerId } from '@/lib/managers'

export type Role = 'tech' | 'asst'
export type TeamKey = 'red' | 'blue'
export type View = 'week' | 'month'

export type Person = { id: string; name: string; role: Role; truck?: string; active?: boolean }

export const STAT_KEYS = [
  'driving',
  'reports',
  'jobs',
  'fwa',
  'callbacks',
  'highGp',
  'amber',
  'early',
  'onQuote',
  'hoursOver',
  'safety',
  'bonus',
] as const

export type StatKey = (typeof STAT_KEYS)[number]
export type Entry = Partial<Record<StatKey, number>>

export type Rules = {
  drivingCutoff: number
  drivingSafe: number
  drivingUnsafe: number
  drivingPerfect: number
  report: number
  job: number
  fwa: number
  callback: number
  gpTarget: number
  highGp: number
  amber: number
  early: number
  onQuote: number
  lateHour: number
  safety: number
  bonusTrash: number
  bonusDumpster: number
  bonusShelf: number
  bonusTeamDriving100: number
  bonusVolunteer: number
  bonusTruckInspection: number
  bonusHitTheMark: number
}

export type Comment = {
  id: string
  /** Roster person id for a competitor's comment; '' for a manager's comment. */
  personId: string
  /** Which manager posted it, when it is a manager's comment. */
  managerId?: ManagerId
  text: string
  createdAt: string
}
export type Announcement = { id: string; text: string; createdAt: string }

export type Store = {
  settings: { startDate: string; team1: string; team2: string }
  rules: Rules
  people: Person[]
  /** Explicit team assignments per month (YYYY-MM). Months without one are drawn automatically. */
  teams: Record<string, Record<string, TeamKey>>
  /** Re-draw code per month; changing it produces a new random draw. */
  redraw: Record<string, number>
  /** Scores keyed by week-ending Friday (YYYY-MM-DD), then person id. */
  scores: Record<string, Record<string, Entry>>
  projections: Record<string, number>
  /** Manual monthly jobs completed (YYYY-MM), set in Manage — replaces the auto-sum for the Board total. */
  jobsCompleted: Record<string, number>
  /** Total number of times the app has been opened (all visitors, including signed-out). Shown in Manage only. */
  views: number
  /** Smack-talk feed, newest first. Kept to the latest 200. */
  comments: Comment[]
  /** Manager announcements, newest first. */
  announcements: Announcement[]
  auth: {
    salt?: string
    hash?: string
    sessions: string[]
    /** Per-competitor passcodes, keyed by person id. A person sets their own the first time they sign in. */
    competitors?: Record<string, { salt: string; hash: string }>
    /** Competitor sessions: hashed token -> person id. */
    competitorSessions?: Record<string, string>
    /** Per-manager passcodes, keyed by manager id. A manager sets their own the first time they sign in. */
    managers?: Record<string, { salt: string; hash: string }>
    /** Manager sessions: hashed token -> manager id. */
    managerSessions?: Record<string, string>
  }
  updatedAt: string
}
