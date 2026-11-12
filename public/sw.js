// Network-first so scores are always live; falls back to the last cached copy when offline.
const CACHE = 'showdown-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Web Push for the Smack Talk feed: a comment, reply or announcement
// arrives as a notification. Tapping it opens (or focuses) the app on the
// Smack Talk tab.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = data.title || 'The Weekly Showdown'
  const body = data.body || 'New activity in Smack Talk.'
  const url = data.url || '/comments'
  const show = () =>
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'showdown-feed',
      data: { url },
    })
  event.waitUntil(
    // If the user is already looking at the app, the new content is
    // already live in front of them (the feed and messages refresh on
    // their own) — posting a notification too would put a number on the
    // app icon for something they have already seen, and that
    // notification would sit in the shade until dismissed. So skip it
    // when a window is focused. If the client list cannot be read,
    // show the notification rather than silently dropping it.
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        if (!clients.some((c) => c.focused)) return show()
      })
      .catch(() => show()),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/comments'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && (request.mode === 'navigate' || request.url.includes('/api/board'))) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  )
})
