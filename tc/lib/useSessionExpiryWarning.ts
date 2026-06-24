'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks how close the clinician/physiotherapist session is to expiry,
 * for a "your access is about to expire" warning on long forms.
 *
 * The session is valid while last_activity_at > now() - 1h, so expiry
 * is lastActivityAt + 1h. This hook recomputes the remaining time on a
 * coarse interval (every 20s — no ticking stopwatch) and reports a
 * simple state the UI can act on.
 *
 * It does NOT itself extend the session — the page decides when to
 * touch (on input, or via a "keep working" button). When the session
 * is touched, lastActivityAt changes and the warning clears on its
 * own.
 */

const SESSION_LENGTH_MS = 60 * 60 * 1000; // 1 hour
// Warn once under 10 minutes remain — enough lead time to save a long
// treatment form without panic.
const WARN_THRESHOLD_MS = 10 * 60 * 1000;

export type SessionExpiryState = 'ok' | 'expiring' | 'expired';

export function useSessionExpiryWarning(
  lastActivityAt: string | null | undefined
): { state: SessionExpiryState; minutesLeft: number } {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(i);
  }, []);

  if (!lastActivityAt) {
    return { state: 'ok', minutesLeft: 60 };
  }

  const expiresAt = new Date(lastActivityAt).getTime() + SESSION_LENGTH_MS;
  const remaining = expiresAt - now;
  const minutesLeft = Math.max(0, Math.ceil(remaining / 60_000));

  let state: SessionExpiryState = 'ok';
  if (remaining <= 0) state = 'expired';
  else if (remaining <= WARN_THRESHOLD_MS) state = 'expiring';

  return { state, minutesLeft };
}
