// Bump this on any change to the strategy below so activate() purges
// caches written by the old (broken) version for returning visitors.
const CACHE_NAME = 'vk-apts-v2'
const STATIC_ASSETS = ['/', '/index.html']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  if (e.request.url.includes('supabase.co')) return // never cache API calls

  // Navigations (HTML) must be network-first: index.html references the
  // build's content-hashed JS/CSS filenames, which change on every deploy.
  // Serving a cached index.html first (the old strategy) means a returning
  // visitor keeps running whatever JS bundle was cached on their first
  // visit — including any bugs already fixed in later deploys — until they
  // manually clear site data. Falls back to cache only if the network is
  // genuinely unreachable (offline).
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone))
        }
        return res
      }).catch(() => caches.match(e.request))
    )
    return
  }

  // Everything else (JS/CSS/images) is content-hashed by the build, so a
  // cached copy is never stale — a given filename's content never changes.
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone))
        }
        return res
      })
    })
  )
})
