'use client'

import { Bell, BellOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Notifications are ON by default: the app asks for browser permission the
// first time a signed-in person opens the Smack Talk tab, and subscribes
// them when they allow it. Anyone who doesn't want them flips the toggle
// off — that unsubscribes this device. The toggle never fakes "on": it
// reads the real subscription state, so if the browser permission is
// denied it shows off and says how to re-enable it.
const ASKED_KEY = 'showdown-push-asked'
const PREF_KEY = 'showdown-push-pref'

type PushState = 'unsupported' | 'loading' | 'on' | 'off' | 'blocked'

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(base64.replace(/-/g, '+').replace(/_/g, '/') + padding)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

export function PushToggle() {
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)
  const [showAsk, setShowAsk] = useState(false)
  const [note, setNote] = useState('')
  const askedRef = useRef(false)

  const subscribe = useCallback(async (): Promise<boolean> => {
    const reg = await getRegistration()
    if (!reg) return false
    try {
      const res = await fetch('/api/push/vapid')
      if (!res.ok) return false
      const { publicKey } = (await res.json()) as { publicKey?: string }
      if (!publicKey) return false
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const save = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      if (!save.ok) {
        await sub.unsubscribe().catch(() => undefined)
        return false
      }
      return true
    } catch {
      return false
    }
  }, [])

  // First visit: notifications default on, so ask right away — with the
  // one-line explanation shown in the banner first. The native prompt may
  // need a tap in some browsers, so the banner's button is the fallback
  // path and stays until the person decides.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!('Notification' in window) || !('PushManager' in window)) {
        setState('unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        setState('blocked')
        return
      }
      const reg = await getRegistration()
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (cancelled) return
      if (sub) {
        setState('on')
        return
      }
      setState('off')
      const pref = (() => {
        try {
          return window.localStorage.getItem(PREF_KEY)
        } catch {
          return null
        }
      })()
      if (pref === 'off') return
      const alreadyAsked = (() => {
        try {
          return window.localStorage.getItem(ASKED_KEY) === '1'
        } catch {
          return true
        }
      })()
      setShowAsk(true)
      if (alreadyAsked || askedRef.current) return
      askedRef.current = true
      try {
        window.localStorage.setItem(ASKED_KEY, '1')
      } catch {
        // Private mode: just don't auto-ask again this session.
      }
      // Attempt the native prompt automatically. If the browser wants a
      // gesture first, this resolves without granting and the banner below
      // is the way in.
      try {
        const permission = await Notification.requestPermission()
        if (cancelled) return
        if (permission === 'granted') {
          setBusy(true)
          const ok = await subscribe()
          setBusy(false)
          if (cancelled) return
          setState(ok ? 'on' : 'off')
          if (ok) setShowAsk(false)
        } else if (permission === 'denied') {
          setState('blocked')
        }
      } catch {
        // Banner stays as the fallback.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [subscribe])

  const turnOn = async () => {
    setBusy(true)
    setNote('')
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permission !== 'granted') {
        if (permission === 'denied') setState('blocked')
        setNote('Notifications are blocked for this site. Turn them back on in your browser or phone settings.')
        return
      }
      const ok = await subscribe()
      if (ok) {
        try {
          window.localStorage.setItem(PREF_KEY, 'on')
        } catch {
          // Ignore storage failures.
        }
        setState('on')
        setShowAsk(false)
      } else {
        setNote('Could not turn notifications on. Check your connection and try again.')
      }
    } catch {
      setNote('Could not turn notifications on. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    setBusy(true)
    setNote('')
    try {
      const reg = await getRegistration()
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe().catch(() => undefined)
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        }).catch(() => undefined)
      }
      try {
        window.localStorage.setItem(PREF_KEY, 'off')
      } catch {
        // Ignore storage failures.
      }
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  const dismissAsk = () => {
    setShowAsk(false)
    try {
      window.localStorage.setItem(ASKED_KEY, '1')
    } catch {
      // Ignore storage failures.
    }
  }

  if (state === 'unsupported') {
    return (
      <p className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Push notifications aren&apos;t supported in this browser.
      </p>
    )
  }

  const needsInstall = isIOS() && !isStandalone()

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
      {showAsk && state !== 'on' && state !== 'blocked' && (
        <div className="flex flex-col gap-2 rounded-xl bg-secondary px-3 py-2.5">
          <p className="text-sm font-semibold">Get a notification when someone posts in Smack Talk, or a manager posts an announcement.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={turnOn} disabled={busy}>
              Turn on notifications
            </Button>
            <Button size="sm" variant="outline" onClick={dismissAsk} disabled={busy}>
              Not now
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {state === 'on' ? <Bell className="size-4" aria-hidden="true" /> : <BellOff className="size-4" aria-hidden="true" />}
          Notifications
          <span className="text-xs font-normal text-muted-foreground">{state === 'on' ? 'On' : 'Off'}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={state === 'on'}
          aria-label="Push notifications"
          onClick={state === 'on' ? turnOff : turnOn}
          disabled={busy || state === 'loading' || state === 'blocked'}
          className={cn(
            'relative h-7 w-12 shrink-0 rounded-full transition-colors',
            state === 'on' ? 'bg-primary' : 'bg-input',
            (busy || state === 'loading' || state === 'blocked') && 'opacity-50',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 size-6 rounded-full bg-background shadow transition-all',
              state === 'on' ? 'left-[calc(100%-1.625rem)]' : 'left-0.5',
            )}
          />
        </button>
      </div>
      {state === 'blocked' && (
        <p className="text-xs text-muted-foreground">
          Notifications are blocked for this site. Turn them back on in your browser or phone settings, then flip this
          switch on again.
        </p>
      )}
      {needsInstall && state !== 'on' && (
        <p className="text-xs text-muted-foreground">
          On iPhone, notifications only work after you install the app to your home screen — tap Share, then &ldquo;Add to
          Home Screen&rdquo;.
        </p>
      )}
      {note && (
        <p role="status" className="text-xs text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  )
}
