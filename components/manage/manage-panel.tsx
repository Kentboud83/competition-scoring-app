'use client'

import { LogOut, Plus, Shuffle, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { addPerson, changePasscode, redrawTeams, removePerson, saveRules, saveSettings, setTeam, signOut } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { RULE_FIELDS } from '@/lib/scoring'
import type { Person, Role, Rules, TeamKey } from '@/lib/types'
import { cn } from '@/lib/utils'

const inputCls =
  'h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="font-display text-xl font-bold uppercase tracking-wide">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export function ManagePanel({
  month,
  monthName,
  people,
  rules,
  settings,
  projection,
  jobsCompleted,
  views = 0,
}: {
  month: string
  monthName: string
  people: (Person & { team: TeamKey })[]
  rules: Rules
  settings: { team1: string; team2: string }
  projection?: number
  jobsCompleted?: number
  views?: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState('')
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const res = await fn()
      setMessage(res.ok ? success : (res.error ?? 'Something went wrong.'))
      if (res.ok) router.refresh()
    })
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<Role>('tech')
  const [ruleDraft, setRuleDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, String(v)])),
  )
  const [team1, setTeam1] = useState(settings.team1)
  const [team2, setTeam2] = useState(settings.team2)
  const [jobsDone, setJobsDone] = useState(jobsCompleted !== undefined ? String(jobsCompleted) : '')
  const [proj, setProj] = useState(projection !== undefined ? String(projection) : '')
  const [passcode, setPasscode] = useState('')
  const count = (team: TeamKey, role: Role) => people.filter((p) => p.team === team && p.role === role).length
  const monthKey = `${month}-15`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-display text-2xl font-bold uppercase tracking-wide">Manage — {monthName}</p>
          <p className="text-sm text-muted-foreground">Season running {settings.team1} vs {settings.team2}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => run(() => signOut(), 'Signed out.')}
          disabled={pending}
          className="gap-1.5"
        >
          <LogOut className="size-4" /> Sign out
        </Button>
      </div>
      {message && (
        <p role="status" className="rounded-xl bg-card p-3 text-center text-sm text-foreground">
          {message}
        </p>
      )}
      <Section title="App views" description="Times the app has been opened">
        <p className="text-2xl font-bold tabular-nums">App views: {views}</p>
      </Section>
      <Section title="Teams" description="Drag individual people across teams, re-randomise, or add people here.">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-team-red">{settings.team1}</span> · {count('red', 'tech')} techs · {count('red', 'asst')} assistants
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {people.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={p.team === 'red' ? 'size-2.5 rounded-full bg-team-red' : 'size-2.5 rounded-full bg-team-blue'} />
                  {p.team === 'red' ? settings.team1 : settings.team2}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <select
                  className={cn('rounded-md border border-input bg-card px-2 py-1 text-sm text-foreground', pending && 'pointer-events-none opacity-50')}
                  value={p.team}
                  onChange={(e) => run(() => setTeam(month, p.id, e.target.value as TeamKey), 'Moved.')}
                  disabled={pending}
                >
                  <option value="red">{settings.team1}</option>
                  <option value="blue">{settings.team2}</option>
                </select>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove person"
                  onClick={() => run(() => removePerson(p.id), 'Removed.')}
                  disabled={pending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={() => run(() => redrawTeams(month), 'Teams redrawn.')} disabled={pending}>
            <Shuffle className="size-4" /> Redraw teams
          </Button>
        </div>
      </Section>
      <Section title="Add person" description="Add a tech or assistant to the roster.">
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Name
            <input className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
              Role
              <select className={inputCls} value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
                <option value="tech">Tech</option>
                <option value="asst">Assistant</option>
              </select>
            </label>
            <Button
              type="button"
              onClick={() =>
                run(
                  () => addPerson(newName.trim(), newRole),
                  'Added — they appear in the Manager panel and on the penultimate Monday a full week is scored.',
                )
              }
              disabled={pending || !newName.trim()}
              className="gap-1.5"
            >
              <Plus className="size-4" /> Add person
            </Button>
          </div>
        </div>
      </Section>
      <Section title="Settings" description="Scores, projections and team names are shared across the week and month Board.">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Team 1 name
            <input className={inputCls} value={team1} onChange={(e) => setTeam1(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Team 2 name
            <input className={inputCls} value={team2} onChange={(e) => setTeam2(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Jobs completed
            <input className={inputCls} value={jobsDone} onChange={(e) => setJobsDone(e.target.value.replace(/[^0-9]/g, '').slice(0, 7))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Weekly projection
            <input className={inputCls} value={proj} onChange={(e) => setProj(e.target.value.replace(/[^0-9]/g, '').slice(0, 7))} />
          </label>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() =>
              run(
                () =>
                  saveSettings({
                    team1,
                    team2,
                    projection: proj,
                    jobsCompleted: jobsDone ? String(jobsDone) : '',
                    month,
                  }),
                'Settings saved.',
              )
            }
            disabled={pending}
            className="gap-1.5"
          >
            Save changes
          </Button>
        </div>
      </Section>
      <Section title="Points" description={settings.team1 + ' and ' + settings.team2 + ' points. GP target: ' + rules.gpTarget + ' GP'}>
        <div className="grid gap-2 sm:grid-cols-2">
          {RULE_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {f.label}
              <input
                className={inputCls}
                value={ruleDraft[f.key]}
                onChange={(e) => setRuleDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() =>
              run(
                () => saveRules(Object.fromEntries(Object.entries(ruleDraft).map(([k, v]) => [k, Number(v)])) as Rules),
                'Points updated.',
              )
            }
            disabled={pending}
          >
            Save points
          </Button>
        </div>
      </Section>
      <Section title="Change passcode">
        <div className="flex gap-2">
          <input
            type="password"
            className={inputCls}
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="New passcode"
          />
          <Button
            type="button"
            onClick={() => run(() => changePasscode(passcode), 'Passcode changed — Sign in again.')} 
            disabled={pending || passcode.length < 4}
          >
            Save passcode
          </Button>
        </div>
      </Section>
    </div>
  )
}
