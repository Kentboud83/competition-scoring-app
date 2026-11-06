import type { Metadata } from 'next'
import { RULE_FIELDS, formatPts } from '@/lib/scoring'
import { readStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'How Points Work · The Weekly Showdown' }

const NOT_POINTS = new Set(['drivingCutoff', 'gpTarget'])

export default async function RulesPage() {
  const { rules, settings } = await readStore()

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">How points work</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Weekly scores (Mon–Sun) add up to your monthly total. {settings.team1} vs {settings.team2} — teams are drawn
          fresh each month and stay balanced between techs and assistants.
        </p>
      </div>
      <ul className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
        {RULE_FIELDS.filter((f) => !NOT_POINTS.has(f.key)).map((f) => {
          const v = rules[f.key]
          return (
            <li key={f.key} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{f.label}</p>
                <p className="text-xs text-muted-foreground">{f.help(rules)}</p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-lg px-2.5 py-1 font-display text-xl font-bold tabular-nums',
                  v >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-destructive/15 text-destructive',
                )}
              >
                {v > 0 ? '+' : ''}
                {formatPts(v)}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Awards each week and month</p>
        <p className="mt-1">Tech of the Week/Month, Asst of the Week/Month, Most Improved, and the winning team.</p>
      </div>
    </div>
  )
}
