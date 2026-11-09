'use client'

import { KeyRound, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { changeManagerPasscode, managerSignIn, managerSignOut } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { MANAGERS } from '@/lib/managers'
import { cn } from '@/lib/utils'

// Manager sign-in: pick your name, enter your password — just like the
// competitors' sign-in, but for the four managers. The first time a name
// signs in, the password they enter becomes theirs. A forgotten password
// can be reset from Manage by another signed-in manager.
export function ManagerSignIn({
  hasPassword,
  signedInAs,
}: {
  hasPassword: Record<string, boolean>
  signedInAs: { id: string; name: string; title: string } | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [selectedId, setSelectedId] = useState(signedInAs?.id ?? '')
  const [code, setCode] = useState('')
  const [newCode, setNewCode] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const selected = MANAGERS.find((m) => m.id === selectedId)
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
        const res = await managerSignIn(selected.id, code)
        if (res.ok) {
          router.push('/manage')
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
        const res = await changeManagerPasscode(newCode)
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
        await managerSignOut()
        router.push('/login')
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
          <KeyRound className="size-6" aria-hidden="true" />
        </span>
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold uppercase">Signed in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You&apos;re signed in as <span className="font-semibold text-foreground">{signedInAs.name}</span> (
            {signedInAs.title}).
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
        <h1 className="font-display text-2xl font-bold uppercase">Manager sign-in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick your name and enter your password. First time? The password you enter now is yours — pick something
          you&apos;ll remember.
        </p>
      </div>
      <div className="flex flex-col gap-2" role="group" aria-label="Your name">
        {MANAGERS.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={selectedId === m.id}
            onClick={() => {
              setSelectedId(m.id)
              setError('')
            }}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
              selectedId === m.id
                ? 'border-primary bg-primary/15 text-foreground'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="text-sm font-semibold">{m.name}</span>
            <span className="text-xs">{m.title}</span>
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
          First sign-in for {selected.name} — this sets your password. If you forget it later, another manager can
          reset it from Manage.
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
    </form>
  )
}
