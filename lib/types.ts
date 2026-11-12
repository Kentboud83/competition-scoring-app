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
  /** Set when the text was last edited (the original position/order is kept). */
  editedAt?: string
  /** Top-level comment this is a reply to. Absent for top-level comments. One level of threading only. */
  parentId?: string
}
export type Announcement = {
  id: string
  text: string
  createdAt: string
  /** Set when the text was last edited (the original position/order is kept). */
  editedAt?: string
  /** Which manager posted it. */
  managerId?: ManagerId
}

/** One browser's push subscription, tied to the person who opted in. */
export type PushSubscriptionRecord = {
  /** Identifies the subscriber: `person:<roster id>` or `manager:<manager id>`. */
  ownerKey: string
  endpoint: string
  keys: { p256dh: string; auth: string }
  createdAt: string
}

/**
 * A 1:1 private direct message, or one message in a group conversation.
 * Only its participants can ever see it — the API enforces that on
 * every read and write.
 */
export type DirectMessage = {
  id: string
  /** Sender: `person:<roster id>` or `manager:<manager id>`. */
  fromKey: string
  /** 1:1 recipient: `person:<roster id>` or `manager:<manager id>`.
      For a group message this is `group:<group id>`. */
  toKey: string
  /** Set for group messages: the group this message belongs to. */
  groupId?: string
  text: string
  createdAt: string
  /** 1:1: set when the recipient has opened the thread and seen it. */
  readAt?: string
  /** Group messages: keys of the members (other than the sender) who
      have opened the thread and seen it. */
  readBy?: string[]
}

/**
 * A group conversation. Membership is fixed at creation — there is no
 * adding or removing members, no renaming, and no group admin controls
 * in v1. Only its members can ever see it.
 */
export type GroupConversation = {
  id: string
  /** Member keys (`person:<roster id>` / `manager:<manager id>`), including the creator. */
  members: string[]
  createdAt: string
  /** Key of the member who created the group. */
  createdBy: string
}

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
  /** Private 1:1 direct messages and group messages, newest first.
      Kept to the latest 500 across all conversations. A message is
      visible only to its participants. */
  directMessages: DirectMessage[]
  /** Group conversations. Membership is fixed at creation; a group only
      shows in a member's list once it has at least one message. */
  messageGroups: GroupConversation[]
  /** Web Push (VAPID) state. Server-only: the private key and the
      subscriptions are never exposed through any API route or client
      payload — only the public key is served, to signed-in users, so
      their browser can subscribe. */
  push?: {
    vapidPublicKey?: string
    vapidPrivateKey?: string
    subscriptions?: PushSubscriptionRecord[]
  }
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
