// Service worker for Treatment Companion.
//
// Two responsibilities right now:
//   1. Receive web push events and display notifications.
//   2. Route notification clicks back into the app (open /checkin).
//
// Caching for offline support is intentionally NOT implemented here.
// A patient who is offline can't submit a check-in to the database
// anyway; pretending the app works offline would make things worse.
// We register a no-op fetch handler so the SW counts as "controlling"
// the page (required for some PWA install prompts).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // No-op: let the browser handle the request normally.
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
