import type { BreakdownLine } from '@/lib/board'
import { formatPts } from '@/lib/scoring'
import { cn } from '@/lib/utils'

function fmtNum(n: number) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

function fmtSigned(n: number) {
  return (n > 0 ? '+' : '') + fmtNum(n)
}

// Short detail under a breakdown line, e.g. "6 × +1" for jobs or
// "1 safe week" for driving. The points for the line are shown at the right.
function lineDetail(line: BreakdownLine) {
  if (line.key === 'driving') return line.detail ?? ''
  if (line.rate === 1) return fmtNum(line.raw)
  return `${fmtNum(line.raw)} × ${fmtSigned(line.rate ?? 0)}`
}

// A tech's per-stat breakdown for the current period, with points per line
// and a Total matching their score. Shared by Rankings and Leaders so both
// views expand to exactly the same breakdown.
export function Breakdown({ id, breakdown, points }: { id: string; breakdown: BreakdownLine[]; points: number }) {
  return (
    <div id={id} className="border-t border-border bg-muted/40 px-4 py-3">
      {breakdown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No scores entered yet for this period.</p>
      ) : (
        <>
          <ul className="flex flex-col">
            {breakdown.map((line) => (
              <li key={line.key} className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{line.label}</p>
                  <p className="text-xs text-muted-foreground">{lineDetail(line)}</p>
                </div>
                <p className={cn('shrink-0 font-display text-base font-bold tabular-nums', line.points < 0 ? 'text-destructive' : 'text-foreground')}>
                  {formatPts(line.points)} pts
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <p className="text-sm font-bold">Total</p>
            <p className="font-display text-base font-bold tabular-nums">{formatPts(points)} pts</p>
          </div>
        </>
      )}
    </div>
  )
}
