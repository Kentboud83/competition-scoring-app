import { Briefcase, Crown, TrendingUp, Wrench } from 'lucide-react'
import type { Board } from '@/lib/board'
import { formatPts } from '@/lib/scoring'
import { cn } from '@/lib/utils'

// The three award spots — Top Technician, Top Assistant Technician and
// Most Improved — computed in lib/board.ts and shown here exactly as
// stored. They live on the Leaders tab; the Board shows the leaders only
// in its normal Rankings list.
export function Awards({ board }: { board: Board }) {
  const period = board.view === 'week' ? 'Week' : 'Month'

  return (
    <section aria-labelledby="awards-title" className="flex flex-col gap-3">
      <h2 id="awards-title" className="font-display text-xl font-bold uppercase tracking-wide">
        Awards
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AwardCard icon={Crown} label={`Tech of the ${period}`} award={board.awards.tech} />
        <AwardCard icon={Wrench} label={`Asst of the ${period}`} award={board.awards.asst} />
        <AwardCard
          icon={TrendingUp}
          label="Most Improved"
          award={board.awards.improved}
          detail={board.awards.improved ? `+${formatPts(board.awards.improved.gain ?? 0)} vs last ${period.toLowerCase()}` : undefined}
        />
      </div>
    </section>
  )
}

// Monthly jobs progress. Not an award — it stays on the Board.
export function JobsProgress({ board }: { board: Board }) {
  const { jobs } = board
  const pct = jobs.projected ? Math.min(100, (jobs.completed / jobs.projected) * 100) : 0

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Briefcase className="size-4 text-primary" aria-hidden="true" />
          {board.monthLabel} jobs
        </span>
        <span className="text-sm tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{jobs.completed}</span>
          {jobs.projected ? ` of ${jobs.projected} projected` : ' completed'}
        </span>
      </div>
      {jobs.projected ? (
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-label="Jobs completed versus projection"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  )
}

function AwardCard({
  icon: Icon,
  label,
  award,
  detail,
}: {
  icon: typeof Crown
  label: string
  award: Board['awards']['tech']
  detail?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-col sm:items-start">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {award ? (
          <>
            <p className="truncate font-semibold">
              <span
                className={cn('mr-1.5 inline-block size-2 rounded-full align-middle', award.team === 'red' ? 'bg-team-red' : 'bg-team-blue')}
                aria-hidden="true"
              />
              {award.name}
            </p>
            <p className="text-xs text-muted-foreground">{detail ?? `${formatPts(award.points)} pts`}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Waiting on scores</p>
        )}
      </div>
    </div>
  )
}
