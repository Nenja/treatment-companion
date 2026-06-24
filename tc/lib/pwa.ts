'use client';

/**
 * PWA + Web Push helpers.
 *
 * The service worker lives at /sw.js. Registration is idempotent
 * (calling register() with the same URL returns the same registration).
 * Push subscriptions are stored on the server via /api/push/subscribe.
 *
 * Browser support gotchas:
 *   - iOS Safari requires the user to "Add to Home Screen" first;
 *     subscription attempts fail otherwise. We detect this and show
 *     install guidance instead of the permission prompt.
 *   - Permission can be in three states: 'granted', 'denied', 'default'.
 *     'denied' is sticky — once a user denies, we can't re-prompt; they
 *     have to change it in browser settings. We surface this clearly.
 */

export function pushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Returns true when the page is being viewed as an installed PWA
 * (display-mode: standalone). Web Push works reliably on iOS only in
 * this state — important for showing the right install guidance.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)');
  // Safari uses navigator.standalone for the legacy detection.
  const navStandalone = (navigator as { standalone?: boolean }).standalone;
  return mq.matches || navStandalone === true;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.error('Service worker registration failed', err);
    return null;
  }
}

/**
 * Convert the VAPID public key from base64url string to a Uint8Array,
 * which is what PushManager.subscribe() requires.
 */
function urlBase64ToApplicationServerKey(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = atob(base64);
  // Allocate a concrete ArrayBuffer and fill it through a view. Returning an
  // ArrayBuffer (not a Uint8Array) keeps the type assignable to the Push API's
  // `applicationServerKey: BufferSource` across TypeScript / @types versions:
  // newer libs type `new Uint8Array(n)` as Uint8Array<ArrayBufferLike>, which —
  // because of SharedArrayBuffer — no longer satisfies BufferSource.
  const buffer = new ArrayBuffer(rawData.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    bytes[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

export interface SubscribeResult {
  status:
    | 'subscribed'
    | 'denied'
    | 'unsupported'
    | 'ios_install_required'
    | 'error';
  message?: string;
}

/**
 * Request notification permission and subscribe to the push service.
 * Sends the resulting subscription to /api/push/subscribe so the
 * server can store it.
 */
export async function subscribeToPush(
  vapidPublicKey: string,
  locale: string
): Promise<SubscribeResult> {
  if (!pushSupported()) {
    return { status: 'unsupported' };
  }

  // iOS quirk: Web Push only works after Add to Home Screen. Detect
  // and show install instructions instead of triggering a doomed
  // permission prompt.
  if (isIOS() && !isStandalone()) {
    return { status: 'ios_install_required' };
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    return { status: 'error', message: 'Service worker not available' };
  }

  // Ask for permission. Will reject silently if already denied.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { status: 'denied' };
  }

  // Subscribe (or get existing). PushManager.subscribe() is idempotent
  // when called with the same applicationServerKey.
  let subscription: PushSubscription;
  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      subscription = existing;
    } else {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToApplicationServerKey(vapidPublicKey)
      });
    }
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err)
    };
  }

  // Send the subscription to our server.
  const sub = subscription.toJSON();
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: sub.keys?.p256dh,
      auth: sub.keys?.auth,
      locale
    })
  });

  if (!res.ok) {
    return {
      status: 'error',
      message: `Could not save subscription (${res.status})`
    };
  }

  return { status: 'subscribed' };
}

/**
 * Unsubscribe the current browser from push notifications. Removes
 * the subscription locally and on the server. Doesn't affect other
 * devices the patient may have subscribed from.
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint })
  });
}
