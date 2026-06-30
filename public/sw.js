// Service worker for Treatment Companion.
//
// Responsibilities:
//   1. Web push: receive push events + route notification clicks (unchanged).
//   2. Offline support: an installable PWA that loads its static assets from
//      cache and shows a friendly offline page when there's no connection.
//
// SAFETY DESIGN (this controls every user, so it's deliberately conservative):
//   - Navigations are NETWORK-FIRST. Online users ALWAYS get the freshest app;
//     the cache is only a fallback. This is what prevents a "stuck on stale
//     code" failure, and it means a fixed deploy propagates normally.
//   - API calls (/api/*), cross-origin requests (e.g. Supabase), and any
//     non-GET request are NEVER cached or intercepted — authenticated/clinical
//     data must not sit in a device cache. The SW only caches PUBLIC static
//     assets (Next build chunks, icons, the offline page).
//   - Authenticated HTML pages are NOT cached either; offline navigation shows
//     /offline.html instead. (Combined with the check-in outbox, a patient who
//     loses connection keeps their saved data and sees a clear message.)
//
// RECOVERY: bump CACHE_VERSION and redeploy to purge old caches. To fully
// remove the SW in an emergency, replace this file's body with:
//   self.addEventListener('install', () => self.skipWaiting());
//   self.addEventListener('activate', (e) => e.waitUntil(
//     self.registration.unregister()
//       .then(() => self.clients.matchAll())
//       .then((cs) => cs.forEach((c) => c.navigate(c.url)))));
// and redeploy.

const CACHE_VERSION = 'tc-cache-v1';
const PRECACHE = [
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {
        // A missing precache asset must not block install.
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GETs. Submits, RPCs, uploads etc. go straight to the network.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept cross-origin (Supabase, aggregator, fonts CDN) or our API.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network-first, fall back to the offline page when offline.
  // The HTML itself is never cached (it can be authenticated/per-patient).
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(CACHE_VERSION);
          const offline = await cache.match('/offline.html');
          return offline || Response.error();
        }
      })()
    );
    return;
  }

  // Immutable Next build assets (content-hashed) + precached files:
  // cache-first — the filename changes when the content changes, so a cached
  // copy can't go stale.
  if (url.pathname.startsWith('/_next/static/') || PRECACHE.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return hit || Response.error();
        }
      })()
    );
    return;
  }

  // Other same-origin GETs (images, icons, fonts): stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const hit = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit || Response.error());
      return hit || network;
    })()
  );
});

self.addEventListener('push', (event) => {
  // The server sends a JSON payload with { title, body, url }. If
  // parsing fails (e.g. an empty push for "wake up the SW"), fall
  // back to a generic notification.
  let payload = {
    title: 'Treatment Companion',
    body: 'Your weekly check-in is ready.',
    url: '/'
  };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      // Treat as plain text body.
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: payload.url }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });
      // If a tab is already open, focus it and navigate to the target.
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // Cross-origin navigate can throw; ignore.
            }
          }
          return;
        }
      }
      // Otherwise open a new window.
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
