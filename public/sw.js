// Service Worker — forces all users to get fresh deploys immediately
const CACHE = 'tcr-v99'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim())
))

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // index.html and all SPA routes — always network first, never cache
  if (url.hostname === location.hostname && !url.pathname.includes('/assets/')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .catch(() => caches.match('/taxcasereview-CRM/index.html'))
    )
    return
  }

  // Hashed /assets/ chunks — cache forever (Vite changes filename on every build)
  if (url.pathname.includes('/assets/')) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached =>
          cached || fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone())
            return res
          })
        )
      )
    )
  }
})
