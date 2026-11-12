'use client'

import { useEffect } from 'react'

export function ServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    }
  }, [])

  // A notification the service worker posted stays in the phone's
  // notification shade — and its count stays badged on the app icon —
  // until it is dismissed or tapped, even after the user has opened the
  // app and already seen the content it was about. So whenever the app
  // is opened or brought back to the front, close any of our posted
  // notifications: the feed and messages already show the content live.
  // Only our own 'showdown-feed' tag is ever closed.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const clearPosted = () => {
      navigator.serviceWorker.ready
        .then((reg) => reg.getNotifications({ tag: 'showdown-feed' }))
        .then((list) => list.forEach((n) => n.close()))
        .catch(() => undefined)
    }
    clearPosted()
    const onVisible = () => {
      if (!document.hidden) clearPosted()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
  return null
}
