/**
 * Classify an unknown error into one of our translation keys.
 *
 * The goal is to give the user a useful message in their language
 * rather than dump raw Postgres/Supabase strings. Returns a key in
 * the `feedback` namespace; the caller does the t() lookup so the
 * locale at the moment of display is correct.
 *
 * Patterns recognised:
 *   - Network errors (offline, fetch fails)
 *   - 401-equivalent (session expired)
 *   - 403 (RLS or explicit forbid)
 *   - 404 (missing row, missing endpoint)
 *   - 409 + "duplicate" or "already" (unique violation)
 *   - 422 / 400 (validation)
 *   - Postgres unique violation (code 23505)
 *
 * Falls back to errorGeneric when nothing matches.
 */
export type FeedbackErrorKey =
  | 'errorNetwork'
  | 'errorSessionExpired'
  | 'errorClinicianUnlockExpired'
  | 'errorPermission'
  | 'errorNotFound'
  | 'errorDuplicate'
  | 'errorInvalidInput'
  | 'errorGeneric';

interface ErrorWithStatus {
  message?: string;
  status?: number;
  statusCode?: number;
  code?: string | number;
  name?: string;
}

export function classifyError(err: unknown): FeedbackErrorKey {
  if (!err) return 'errorGeneric';

  const e = (err ?? {}) as ErrorWithStatus;
  const msg = (e.message ?? String(err)).toLowerCase();
  const status = e.status ?? e.statusCode;
  const code = String(e.code ?? '');

  // Network / offline
  if (
    e.name === 'TypeError' && /fetch|network/i.test(msg) ||
    /failed to fetch|networkerror|network request failed/.test(msg)
  ) {
    return 'errorNetwork';
  }

  // Specific clinician-unlock-expiry heuristic. The submit_treatment_session
  // RPC raises "no active session for this patient" via SECURITY DEFINER
  // when the unlock has expired. Catch that string.
  if (/no active session/.test(msg)) {
    return 'errorClinicianUnlockExpired';
  }

  // Auth session expired. Supabase returns 401 plus messages like
  // "JWT expired" or "invalid JWT".
  if (status === 401 || /jwt|not signed in|unauthorized/i.test(msg)) {
    return 'errorSessionExpired';
  }

  if (status === 403 || /forbidden|permission/i.test(msg)) {
    return 'errorPermission';
  }

  if (status === 404 || /not found/i.test(msg)) {
    return 'errorNotFound';
  }

  if (
    status === 409 ||
    code === '23505' ||
    /already (registered|exists)|duplicate|unique constraint/i.test(msg)
  ) {
    return 'errorDuplicate';
  }

  if (status === 400 || status === 422 || /invalid|check constraint|violates/i.test(msg)) {
    return 'errorInvalidInput';
  }

  return 'errorGeneric';
}
