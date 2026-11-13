'use client'

import { Bell, BellOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Notifications are ON by default: the app shows a banner the first time
// a signed-in person opens the Smack Talk tab, and tapping "Turn on
// notifications" fires the phone's own permission prompt. On the Smack Talk
// tab the control hides once notifications are ON (Kent's call, Nov 12) —
// but the Settings menu (gear icon in the header) always shows the switch,
// so anyone can turn notifications back off from inside the app. The toggle
// never fakes "on": it reads the real subscription state, so if the browser
// permission is denied it shows off and says how to re-enable it.
// It re-checks the permission every time the person returns to the tab, so
// allowing it in the phone settings while the app is open un-blocks the
// switch without a reload (there is also a "Check again" button on the
// blocked card for the same re-check).
//
// The native prompt is ONLY ever fired from a tap. Chrome on Android
// allows the notification prompt only in response to a user gesture: a
// no-gesture call on page load is silently dropped (resolves "default",
// no prompt ever appears) or surfaces the system sheet at a moment the
// user didn't ask for it and leaves the page stuck behind it. That
// on-load auto-attempt was the freeze Kent hit on his phone, so it is
// gone — the banner button is the way in.
const ASKED_KEY = 'showdown-push-asked'
const PREF_KEY = 'showdown-push-pref'

type PushState = 'unsupported' | 'loading' | 'on' | 'off' | 'blocked'

// Resolve with `fallback` if `promise` hasn't settled in `ms`. Used so a
// stuck service worker or a slow push-service handshake can never leave
// the toggle disabled forever — the UI always lands in a real state.
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

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
    // serviceWorker.ready never resolves if the worker is stuck
    // installing or updating — without the timeout the toggle would sit
    // disabled in "loading" forever on a phone with a stale worker.
    return await withTimeout(navigator.serviceWorker.ready, 5000, null)
  } catch {
    return null
  }
}

export function PushToggle({ alwaysShow = false }: { alwaysShow?: boolean }) {
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)
  const [showAsk, setShowAsk] = useState(false)
  const [note, setNote] = useState('')
  // Guards the async re-checks so a stale one can't overwrite a newer
  // result (focus and visibilitychange can fire back to back).
  const runIdRef = useRef(0)

  const subscribe = useCallback(async (): Promise<boolean> => {
    const reg = await getRegistration()
    if (!reg) return false
    try {
      const res = await fetch('/api/push/vapid')
      if (!res.ok) return false
      const { publicKey } = (await res.json()) as { publicKey?: string }
      if (!publicKey) return false
      const sub = await withTimeout(
        reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }),
        20000,
        null,
      )
      if (!sub) return false
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

  // Re-reads the real permission + subscription state and updates the UI.
  // Runs on mount AND every time the person returns to the tab (window
  // focus / visibilitychange): if they allowed notifications in the phone
  // or browser settings while the app was open, the toggle used to stay
  // stuck on the old 'blocked' state because this only ran once on mount.
  // This only READS state — it never calls Notification.requestPermission();
  // the native prompt still fires only from a tap (turnOn).
  const refreshState = useCallback(async () => {
    const runId = ++runIdRef.current
    if (!('Notification' in window) || !('PushManager' in window)) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('blocked')
      return
    }
    const reg = await getRegistration()
    const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null
    if (runId !== runIdRef.current) return
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
    if (alreadyAsked) return
    // In the Settings menu the switch itself is the control, so there is
    // no first-visit banner — only the Smack Talk spot shows it.
    if (!alwaysShow) setShowAsk(true)
  }, [alwaysShow])

  // First visit: notifications default on, so show the banner explaining
  // them. The native prompt fires ONLY when the person taps "Turn on
  // notifications" (or the toggle) — that tap is the user gesture the
  // phone needs to show its permission page. Nothing here calls
  // Notification.requestPermission() on load: that was the freeze.
  useEffect(() => {
    refreshState()
    const onFocus = () => {
      refreshState()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshState()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refreshState])

  // Manual re-check for the blocked card: the person just allowed
  // notifications in their phone/browser settings and taps this instead
  // of leaving the page. Same read-only check as the focus refresh.
  const checkAgain = async () => {
    setBusy(true)
    setNote('')
    try {
      await refreshState()
    } finally {
      setBusy(false)
    }
  }

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

  // On the Smack Talk tab the control hides entirely once notifications
  // are ON — no banner, no switch. In the Settings menu (alwaysShow) it
  // stays visible so the switch can turn them back off.
  if (state === 'on' && !alwaysShow) {
    return null
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
        <div className="flex flex-col items-start gap-2">
          <p className="text-xs text-muted-foreground">
            Notifications are blocked for this site. Turn them back on in your browser or phone settings, then tap Check
            again — or just switch back to this tab and it will pick the change up.
          </p>
          <Button size="sm" variant="outline" onClick={checkAgain} disabled={busy}>
            Check again
          </Button>
        </div>
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
