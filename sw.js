// CIPHER Service Worker — offline shell + push notifications
const CACHE = 'cipher-v1'
const SHELL = [
  '/',
  '/index.html',
  '/login.html',
  '/leads.html',
  '/settings.html',
  '/notifications.html',
  '/css/app.css',
  '/js/api.js',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Network-first for API calls, cache-first for shell assets
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // API calls — always network, no caching
  if (url.pathname.startsWith('/api/')) return

  // Shell assets — cache-first with network fallback
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      }).catch(() => caches.match('/index.html'))
    })
  )
})

// Web Push notifications
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {}
  const title = data.title || 'CIPHER Alert'
  const opts = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.type || 'default',
    data: { url: data.url || '/' },
  }
  e.waitUntil(self.registration.showNotification(title, opts))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url || '/'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
      const existing = ws.find(w => w.url.includes(url))
      if (existing) return existing.focus()
      return clients.openWindow(url)
    })
  )
})
