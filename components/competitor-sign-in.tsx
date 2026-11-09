'use client'

import { KeyRound, LogOut, User } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { changeCompetitorPasscode, competitorSignIn, competitorSignOut } from '@/app/actions'
import { Button } from '@/components/ui/button'
import type { TeamKey } from '@/lib/types'
import { cn } from '@/lib/utils'

export type LoginPerson = { id: string; name: string; team: TeamKey }

// Competitor sign-in: pick your name, enter your password. The first time
// a name signs in, the password they enter becomes theirs. Kent can reset
// a forgotten password from Manage; the person then sets a new one here.
export function CompetitorSignIn({
  people,
  hasPassword,
  signedInAs,
}: {
  people: LoginPerson[]
  hasPassword: Record<string, boolean>
  signedInAs: { id: string; name: string } | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [selectedId, setSelectedId] = useState(signedInAs?.id ?? '')
  const [code, setCode] = useState('')
  const [newCode, setNewCode] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const selected = people.find((p) => p.id === selectedId)
  const firstTime = selected ? !hasPassword[selected.id] : false

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) {
      setError('Pick your name first.')
      return
    }
    setError('')
    start(async () => {
      try {
        const res = await competitorSignIn(selected.id, code)
        if (res.ok) {
          router.push('/')
          router.refresh()
        } else {
          setError(res.error)
        }
      } catch {
        setError('Something went wrong signing in. Check your connection and try again.')
      }
    })
  }

  const change = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    start(async () => {
      try {
        const res = await changeCompetitorPasscode(newCode)
        if (res.ok) {
          setMessage('Password updated.')
          setNewCode('')
        } else {
          setError(res.error)
        }
      } catch {
        setError('Something went wrong. Check your connection and try again.')
      }
    })
  }

  const signOut = () => {
    start(async () => {
      try {
        await competitorSignOut()
        router.refresh()
      } catch {
        setError('Something went wrong signing out.')
      }
    })
  }

  if (signedInAs) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-card p-6">
        <span className="flex size-12 items-center justify-center self-center rounded-full bg-primary/15 text-primary">
          <User className="size-6" aria-hidden="true" />
        </span>
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold uppercase">Signed in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You&apos;re signed in as <span className="font-semibold text-foreground">{signedInAs.name}</span>. Your
            comments will post under your name.
          </p>
        </div>
        {message && (
          <p role="status" className="rounded-lg bg-secondary px-3 py-2 text-sm">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <form onSubmit={change} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Change your password
            <input
              type="password"
              autoComplete="new-password"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              minLength={4}
              required
              placeholder="New password"
              className="h-11 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <Button type="submit" size="lg" variant="secondary" disabled={pending}>
            {pending ? 'Saving…' : 'Update password'}
          </Button>
        </form>
        <Button variant="ghost" size="lg" disabled={pending} onClick={signOut} className="gap-1.5">
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-card p-6">
      <span className="flex size-12 items-center justify-center self-center rounded-full bg-primary/15 text-primary">
        <KeyRound className="size-6" aria-hidden="true" />
      </span>
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold uppercase">Competitor sign-in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick your name and enter your password to join the smack talk. First time? The password you enter now is
          yours — pick something you&apos;ll remember.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Your name">
        {people.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={selectedId === p.id}
            onClick={() => {
              setSelectedId(p.id)
              setError('')
            }}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors',
              selectedId === p.id
                ? 'border-primary bg-primary/15 text-foreground'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            <span className={cn('size-2 shrink-0 rounded-full', p.team === 'red' ? 'bg-team-red' : 'bg-team-blue')} aria-hidden="true" />
            <span className="truncate">{p.name}</span>
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Password
        <input
          type="password"
          autoComplete={firstTime ? 'new-password' : 'current-password'}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          minLength={4}
          required
          disabled={!selected}
          placeholder={selected ? (firstTime ? 'Choose your password' : 'Your password') : 'Pick your name first'}
          className="h-11 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
      </label>
      {firstTime && selected && (
        <p className="text-xs text-muted-foreground">
          First sign-in for {selected.name.split(' ')[0]} — this sets your password. If you forget it later, Kent can
          reset it for you.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending || !selected}>
        {pending ? 'Checking…' : firstTime ? 'Set password & sign in' : 'Sign in'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Manager?{' '}
        <Link href="/manage" className="font-semibold text-foreground underline underline-offset-2">
          Sign in with the manager passcode
        </Link>
      </p>
    </form>
  )
}
