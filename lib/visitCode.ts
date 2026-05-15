// ---------------------------------------------------------------------------
// Visit codes
//
// Short, readable codes used by patients to grant a clinician temporary
// access to their information during a visit. Format: 6 alphanumeric
// characters in two groups of three, e.g. "K7N-Q4M". Excludes
// ambiguous characters (0/O, 1/I/L) to reduce read-aloud errors.
//
// A code is tied to one patient and one expiry timestamp. Once consumed
// by a clinician unlock OR expired by time, it cannot be reused.
// ---------------------------------------------------------------------------

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// 23 letters + 8 digits = 31 chars; 31^6 ≈ 887M combinations.

export const VISIT_CODE_TTL_MINUTES = 10;

export interface VisitCode {
  /** The code itself, without separator. Stored uppercase. */
  code: string;
  patientId: string;
  /** ISO timestamp at which this code stops being valid. */
  expiresAt: string;
  /** ISO timestamp at which the code was consumed by a clinician unlock. */
  consumedAt?: string;
}

function pickRandomChar(): string {
  const idx = Math.floor(Math.random() * CODE_ALPHABET.length);
  return CODE_ALPHABET[idx];
}

export function generateVisitCodeString(): string {
  let raw = '';
  for (let i = 0; i < 6; i++) raw += pickRandomChar();
  return raw;
}

/** Format the raw 6-char code as "XXX-XXX" for display. */
export function formatVisitCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== 6) return cleaned;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}`;
}

/** Normalise user input back to raw 6-char form for lookup. */
export function normalizeVisitCodeInput(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isExpired(code: VisitCode, now: Date = new Date()): boolean {
  return new Date(code.expiresAt).getTime() < now.getTime();
}

export function isUsable(code: VisitCode, now: Date = new Date()): boolean {
  return !code.consumedAt && !isExpired(code, now);
}
