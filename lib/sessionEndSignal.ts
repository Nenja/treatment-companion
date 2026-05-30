/**
 * Deliberate session-end signal.
 *
 * When a clinician or therapist taps "End session", two things race to
 * navigate: the End session handler (which goes to the unlock screen
 * with ?ended=1) and the current page's own session guard (which sees
 * sessionQuery.data become null after the session is ended and tries
 * to redirect on its own, sometimes with a ?timeout=1 marker).
 *
 * If the guard's navigation wins, the deliberate ?ended=1 marker is
 * lost and the unlock page may wrongly show "you were timed out".
 *
 * This module is a tiny shared flag the End session flow sets BEFORE
 * ending the session. Every page guard checks it and stands down while
 * it is set, so only the deliberate navigation happens. It is mirrored
 * to sessionStorage so it survives the navigation to the unlock page
 * (a fresh document load), where it can be read and then cleared.
 *
 * Kept deliberately dumb: a boolean. No expiry, no listeners. The
 * unlock page clears it on read; if anything ever leaves it set, the
 * worst case is one suppressed timeout message, which is harmless.
 */

const KEY = 'tc:session-ending-deliberately';

let inMemory = false;

export function markSessionEndingDeliberately(): void {
  inMemory = true;
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // sessionStorage may be unavailable (private mode, SSR). The
    // in-memory flag still covers the same-document guard race, which
    // is the important case.
  }
}

export function isSessionEndingDeliberately(): boolean {
  if (inMemory) return true;
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function clearSessionEndingFlag(): void {
  inMemory = false;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
