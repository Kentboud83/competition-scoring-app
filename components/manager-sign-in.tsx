'use client'

import { Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { signIn } from '@/app/actions'
import { Button } from '@/components/ui/button'

export function ManagerSignIn({ firstRun }: { firstRun: boolean }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    start(async () => {
      const res = await signIn(code)
      if (res.ok) router.refresh()
      else setError(res.error)
    })
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-card p-6">
      <span className="flex size-12 items-center justify-center self-center rounded-full bg-primary/15 text-primary">
        <Lock className="size-6" aria-hidden="true" />
      </span>
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold uppercase">{firstRun ? 'Set manager passcode' : 'Manager sign-in'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {firstRun
            ? 'Choose a passcode. Only people with it can enter scores or change settings.'
            : 'Enter the manager passcode to enter scores. Everyone else can view the board.'}
        </p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Passcode
        <input
          type="password"
          autoComplete={firstRun ? 'new-password' : 'current-password'}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          minLength={4}
          required
          className="h-11 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Checking…' : firstRun ? 'Set passcode & continue' : 'Sign in'}
      </Button>
    </form>
  )
}
