// The managers. Each signs in under their own name with a password they
// set themselves the first time — just like the competitors. There is no
// shared manager passcode anymore.
//
// This lives in its own module (no 'server-only') because the manager list
// is also rendered by client components: the sign-in name picker and the
// Manage panel's login list.
export const MANAGERS = [
  { id: 'kent', name: 'Kent', title: 'Service Manager' },
  { id: 'andrew', name: 'Andrew', title: 'Branch Manager' },
  { id: 'amber', name: 'Amber', title: 'Operations Manager' },
  { id: 'jeff', name: 'Jeff', title: 'Field Supervisor' },
] as const

export type ManagerId = (typeof MANAGERS)[number]['id']
