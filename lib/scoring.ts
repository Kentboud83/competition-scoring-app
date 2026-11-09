import type { Entry, Rules, StatKey } from './types'

export const DEFAULT_RULES: Rules = {
  drivingCutoff: 96,
  drivingSafe: 1,
  drivingUnsafe: -2,
  drivingPerfect: 2,
  report: 1,
  job: 1,
  fwa: 1,
  callback: -2,
  gpTarget: 0.63,
  highGp: 3,
  amber: -3,
  early: 2,
  onQuote: 1,
  lateHour: -0.25,
  safety: -5,
  bonusTrash: 5,
  bonusDumpster: 5,
  bonusShelf: 5,
  bonusTeamDriving100: 5,
  bonusVolunteer: 3,
  bonusTruckInspection: 2,
  bonusHitTheMark: 2,
}

export const STAT_FIELDS: { key: StatKey; label: string; short: string; step?: number; allowNegative?: boolean }[] = [
  { key: 'driving', label: 'Driving Score', short: 'Driving' },
  { key: 'reports', label: 'Reports Turned In', short: 'Reports' },
  { key: 'jobs', label: 'Jobs Completed', short: 'Jobs' },
  { key: 'fwa', label: 'FWAs Turned In', short: 'FWAs' },
  { key: 'callbacks', label: 'Warranty Callbacks', short: 'Callbacks' },
  { key: 'highGp', label: 'Jobs w/ High GP%', short: 'High GP' },
  { key: 'amber', label: "Times on Amber's List", short: "Amber's" },
  { key: 'early', label: 'Jobs Finished Early', short: 'Early' },
  { key: 'onQuote', label: 'Jobs Finished On Quote', short: 'On Quote' },
  { key: 'hoursOver', label: 'Total Hours Over Quote', short: 'Hrs Over', step: 0.25 },
  { key: 'safety', label: 'Safety Incidents', short: 'Safety' },
  { key: 'bonus', label: 'Bonus Points', short: 'Bonus', step: 0.25, allowNegative: true },
]

export const RULE_FIELDS: { key: keyof Rules; label: string; help: (r: Rules) => string; step: number }[] = [
  { key: 'drivingCutoff', label: 'Driving score cutoff', step: 1, help: (r) => `A truck driver's weekly driving score of ${r.drivingCutoff} or higher counts as a safe week.` },
  { key: 'drivingSafe', label: 'Driving at/above cutoff', step: 0.25, help: (r) => `Points for a truck driver's driving score of ${r.drivingCutoff}+.` },
  { key: 'drivingUnsafe', label: 'Driving below cutoff', step: 0.25, help: (r) => `Points for a truck driver's driving score under ${r.drivingCutoff}.` },
  { key: 'drivingPerfect', label: 'Driving score of 100 (perfect)', step: 0.25, help: () => 'Points for a truck driver with a perfect driving score of 100.' },
  { key: 'report', label: 'Report turned in', step: 0.25, help: () => 'Points for every report turned in — LOTO reports and equipment inspection reports (scissor lift, man lift, ladder, trailer). Assistants only.' },
  { key: 'job', label: 'Job completed', step: 0.25, help: () => 'Points for every job you complete.' },
  { key: 'fwa', label: 'FWA turned in', step: 0.25, help: () => 'Points for every Field Work Authorization turned in.' },
  { key: 'callback', label: 'Warranty callback', step: 0.25, help: () => 'Points for every warranty callback.' },
  { key: 'gpTarget', label: 'GP% target', step: 0.01, help: (r) => `A job counts as high-GP when its GP% is above ${Math.round(r.gpTarget * 100)}%.` },
  { key: 'highGp', label: 'High-GP job', step: 0.25, help: () => 'Points for every job finished above the GP% target.' },
  { key: 'amber', label: "On Amber's list", step: 0.25, help: () => "Points each time you make Amber's list." },
  { key: 'early', label: 'Job finished early', step: 0.25, help: () => 'Points for every job completed faster than quoted.' },
  { key: 'onQuote', label: 'Job finished on quote', step: 0.25, help: () => 'Points for every job completed right at the quoted time.' },
  { key: 'lateHour', label: 'Late (per hour over)', step: 0.25, help: () => 'Points per hour over quote, added up across all late jobs.' },
  { key: 'safety', label: 'Safety incident', step: 0.25, help: () => 'Points for every safety incident. Safety first!' },
]

export const BONUS_RULE_FIELDS: { key: keyof Rules; label: string; help: (r: Rules) => string; step: number; valueSuffix?: string }[] = [
  { key: 'bonusTrash', label: 'Emptying trash cans', step: 0.25, help: () => 'Points for emptying trash cans.' },
  { key: 'bonusDumpster', label: 'Taking boxes to the dumpster', step: 0.25, help: () => 'Points for taking boxes to the dumpster.' },
  { key: 'bonusShelf', label: 'Organizing the parts shelf', step: 0.25, help: () => 'Points for organizing the parts shelf.' },
  { key: 'bonusTeamDriving100', label: 'Every technician on the team scores 100 driving', step: 0.25, valueSuffix: ' to the team', help: () => 'Points to the team when every technician on the team scores 100 driving.' },
  { key: 'bonusVolunteer', label: 'Volunteering for after-hours/weekend work', step: 0.25, help: () => 'Points for volunteering for after-hours/weekend work.' },
  { key: 'bonusTruckInspection', label: 'Truck inspections', step: 0.25, help: () => 'Points for a truck inspection.' },
  { key: 'bonusHitTheMark', label: 'Each "Hit the Mark" card filled out', step: 0.25, help: () => 'Points for each "Hit the Mark" card filled out.' },
]

// Points a single weekly driving score earns. Shared by scoreEntry and
// the breakdown so the two can never disagree.
export function drivingPoints(score: number | undefined, rules: Rules) {
  if (score === undefined) return 0
  if (score === 100) return rules.drivingPerfect
  if (score >= rules.drivingCutoff) return rules.drivingSafe
  return rules.drivingUnsafe
}

// Drivers (people with a truck number) earn driving points; everyone else
// (assistants riding along) earns report points instead — reports turned
// in, like LOTO reports and equipment inspections. A driving score or a
// report count entered for the wrong group earns nothing.
export function scoreEntry(entry: Entry | undefined, rules: Rules, isDriver = true) {
  if (!entry) return 0
  const n = (k: StatKey) => entry[k] ?? 0
  const driving = isDriver ? drivingPoints(entry.driving, rules) : 0
  const reports = isDriver ? 0 : n('reports') * rules.report
  return (
    driving +
    reports +
    n('jobs') * rules.job +
    n('fwa') * rules.fwa +
    n('callbacks') * rules.callback +
    n('highGp') * rules.highGp +
    n('amber') * rules.amber +
    n('early') * rules.early +
    n('onQuote') * rules.onQuote +
    n('hoursOver') * rules.lateHour +
    n('safety') * rules.safety +
    n('bonus')
  )
}

export const hasEntry = (entry: Entry | undefined) => !!entry && Object.keys(entry).length > 0

export function formatPts(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}
