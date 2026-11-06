import { Swords } from 'lucide-react'
import type { Board } from '@/lib/board'
import { formatPts } from '@/lib/scoring'
import { cn } from '@/lib/utils'

export function TeamBattle({ board }: { board: Board }) {
  const [red, blue] = board.teams
  const total = Math.max(red.points, 0) + Math.max(blue.points, 0)
  const redPct = total > 0 ? (Math.max(red.points, 0) / total) * 100 : 50
  const leaderName = board.leader === 'red' ? red.name : board.leader === 'blue' ? blue.name : null

  return (
    <section aria-labelledby="battle-title" className="overflow-hidden rounded-2xl border border-border bg-card">
      <h2 id="battle-title" className="sr-only">
        Team battle
      </h2>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-4">
        <TeamScore name={red.name} points={red.points} color="red" leading={board.leader === 'red'} meta={`${red.techs} techs · ${red.assts} assts`} />
        <Swords className="size-6 text-muted-foreground" aria-hidden="true" />
        <TeamScore name={blue.name} points={blue.points} color="blue" leading={board.leader === 'blue'} meta={`${blue.techs} techs · ${blue.assts} assts`} align="right" />
      </div>
      <div className="flex h-2.5" aria-hidden="true">
        <div className="bg-team-red transition-all duration-700" style={{ width: `${redPct}%` }} />
        <div className="flex-1 bg-team-blue transition-all duration-700" />
      </div>
      <p className="px-4 py-3 text-center text-sm font-medium">
        {board.leader === null
          ? 'No scores yet — the battle is about to begin.'
          : board.leader === 'tie'
            ? 'Dead even! Every point counts.'
            : `${leaderName} leads by ${formatPts(board.margin)} pts`}
      </p>
    </section>
  )
}

function TeamScore({
  name,
  points,
  color,
  leading,
  meta,
  align = 'left',
}: {
  name: string
  points: number
  color: 'red' | 'blue'
  leading: boolean
  meta: string
  align?: 'left' | 'right'
}) {
  return (
    <div className={cn('flex flex-col', align === 'right' && 'items-end text-right')}>
      <span className={cn('text-sm font-semibold uppercase tracking-wider', color === 'red' ? 'text-team-red' : 'text-team-blue')}>
        {name}
      </span>
      <span className={cn('font-display text-5xl font-extrabold tabular-nums leading-none', leading && 'text-primary')}>
        {formatPts(points)}
      </span>
      <span className="mt-1 text-xs text-muted-foreground">{meta}</span>
    </div>
  )
}
