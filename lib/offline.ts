'use client';

/** Best-effort online check. SSR (no navigator) is treated as online. */
export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

/**
 * Heuristic: did this error come from a lost connection rather than the
 * server rejecting the request? `navigator.onLine === false` is decisive;
 * otherwise we look for the shapes a fetch failure takes across browsers.
 * A genuine server error (validation, auth) returns false, so it isn't
 * mistaken for an offline condition and silently queued.
 */
export function isOfflineError(err: unknown): boolean {
  if (!isOnline()) return true;
  const msg = ((err as { message?: string } | null)?.message ?? '')
    .toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('load failed') ||
    msg.includes('connection') ||
    msg.includes('timeout')
  );
}
