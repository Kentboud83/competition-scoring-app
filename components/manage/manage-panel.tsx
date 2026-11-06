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
}: {
  month: string
  monthName: string
  people: (Person & { team: TeamKey })[]
  rules: Rules
  settings: { team1: string; team2: string }
  projection?: number
    jobsCompleted?: number
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Manage</h1>
        <Button variant="ghost" size="sm" onClick={() => run(signOut, 'Signed out')} className="gap-1.5">
          <LogOut className="size-4" aria-hidden="true" />Sign out
        </Button>
      </div>
      {message && (
        <p role="status" className="rounded-lg bg-secondary px-3 py-2 text-sm">
          {message}
        </p>
      )}

      <Section title={`${monthName} teams`} description="Teams are drawn randomly each month, balanced by role. Tap a person to switch teams.">
        <div className="grid grid-cols-2 gap-2 text-center text-xs text-muted-foreground">
          <p>
            <span className="font-semibold text-team-red">{settings.team1}</span> · {count('red', 'tech')} techs, {count('red', 'asst')} assts
          </p>
          <p>
            <span className="font-semibold text-team-blue">{settings.team2}</span> · {count('blue', 'tech')} techs, {count('blue', 'asst')} assts
          </p>
        </div>
        <ul className="flex flex-col gap-1.5">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                {p.name} <span className="text-muted-foreground">· {p.role === 'tech' ? 'Tech' : 'Asst'}</span>
              </span>
              <div className="flex rounded-lg bg-secondary p-0.5" role="group" aria-label={`Team for ${p.name}`}>
                {(['red', 'blue'] as TeamKey[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={p.team === t}
                    disabled={pending}
                    onClick={() => p.team !== t && run(() => setTeam(month, p.id, t), `${p.name} moved`)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-semibold',
                      p.team === t ? (t === 'red' ? 'bg-team-red text-white' : 'bg-team-blue text-white') : 'text-muted-foreground',
                    )}
                  >
                    {t === 'red' ? 'Red' : 'Blue'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => confirm(`Remove ${p.name} from the roster?`) && run(() => removePerson(p.id), `${p.name} removed`)}
                className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${p.name}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <Button variant="secondary" disabled={pending} onClick={() => run(() => redrawTeams(month), 'Teams re-drawn')} className="gap-1.5">
          <Shuffle className="size-4" aria-hidden="true" />Re-draw teams
        </Button>
      </Section>

      <Section title="Add to roster">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => addPerson(newName, newRole), `${newName} added`)
            setNewName('')
          }}
        >
          <label className="sr-only" htmlFor="new-name">
            Name
          </label>
          <input id="new-name" className={inputCls} placeholder="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <label className="sr-only" htmlFor="new-role">
            Role
          </label>
          <select id="new-role" className={cn(inputCls, 'sm:w-40')} value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
            <option value="tech">Tech</option>
            <option value="asst">Assistant</option>
          </select>
          <Button type="submit" size="lg" disabled={pending} className="gap-1.5">
            <Plus className="size-4" aria-hidden="true" />Add
          </Button>
        </form>
      </Section>

      <Section title="Competition settings">
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Team 1 name
            <input className={inputCls} value={team1} onChange={(e) => setTeam1(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Team 2 name
            <input className={inputCls} value={team2} onChange={(e) => setTeam2(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {monthName} total jobs
            <input className={inputCls} type="number" inputMode="numeric" min={0} value={proj} onChange={(e) => setProj(e.target.value)} />
          </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                                Jobs completed                    
                                <input className={inputCls} type="number" inputMode="numeric" min={0} value={jobsDone} onChange={(e) => setJobsDone(e.target.value)} />
                    </label>
        </div>
        <Button disabled={pending} onClick={() => run(() => saveSettings({ team1, team2, projection: proj, jobsCompleted: jobsDone, month }), 'Settings saved')}>
          Save settings
        </Button>
      </Section>

      <Section title="Point values" description="Changes recalculate every score on the board instantly.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {RULE_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {f.label}
              <input
                className={cn(inputCls, 'tabular-nums')}
                type="number"
                inputMode="decimal"
                step={f.step}
                value={ruleDraft[f.key] ?? ''}
                onChange={(e) => setRuleDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <Button
          disabled={pending}
          onClick={() => run(() => saveRules(Object.fromEntries(Object.entries(ruleDraft).map(([k, v]) => [k, Number(v)]))), 'Point values saved')}
        >
          Save point values
        </Button>
      </Section>

      <Section title="Manager passcode" description="Changing it signs out every other device.">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => changePasscode(passcode), 'Passcode updated')
            setPasscode('')
          }}
        >
          <label className="sr-only" htmlFor="new-passcode">
            New passcode
          </label>
          <input
            id="new-passcode"
            type="password"
            autoComplete="new-password"
            minLength={4}
            required
            className={inputCls}
            placeholder="New passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
          />
          <Button type="submit" size="lg" variant="secondary" disabled={pending}>
            Update
          </Button>
        </form>
      </Section>
    </div>
  )
}
