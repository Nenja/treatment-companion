/**
 * Profession labels for non-physician professional accounts.
 *
 * The application has a single non-physician professional role
 * (role = 'physiotherapist' internally, for historical reasons). The
 * `profession` field on the profile is a DISPLAY label only — it
 * records what kind of professional the user is, without affecting
 * what they are permitted to do.
 *
 * This module is the single source of truth for the fixed set of
 * profession codes and how each one is shown to the user. Keep the
 * codes in step with the check constraint in migration 0040.
 */

export const PROFESSION_CODES = [
  'physiotherapist',
  'occupational_therapist',
  'nurse',
  'speech_therapist',
  'other'
] as const;

export type ProfessionCode = (typeof PROFESSION_CODES)[number];

/** English display labels. */
const LABELS_EN: Record<ProfessionCode, string> = {
  physiotherapist: 'Physiotherapist',
  occupational_therapist: 'Occupational therapist',
  nurse: 'Nurse',
  speech_therapist: 'Speech therapist',
  other: 'Other'
};

/** Danish display labels. */
const LABELS_DA: Record<ProfessionCode, string> = {
  physiotherapist: 'Fysioterapeut',
  occupational_therapist: 'Ergoterapeut',
  nurse: 'Sygeplejerske',
  speech_therapist: 'Talepædagog',
  other: 'Andet'
};

function isProfessionCode(value: unknown): value is ProfessionCode {
  return (
    typeof value === 'string' &&
    (PROFESSION_CODES as readonly string[]).includes(value)
  );
}

/**
 * Display label for a profession.
 *
 * Pass the profile's `profession` code and, when the code is 'other',
 * the free-text `professionOther`. For 'other' the free text is
 * returned directly (it is what the user wrote, so it needs no
 * translation); if 'other' is set but the free text is missing, the
 * generic "Other"/"Andet" label is used as a fallback.
 *
 * Returns null when no profession is set — callers should then fall
 * back to the generic role label.
 */
export function professionLabel(
  profession: string | null | undefined,
  professionOther: string | null | undefined,
  locale: 'en' | 'da'
): string | null {
  if (!isProfessionCode(profession)) return null;
  if (profession === 'other') {
    const trimmed = (professionOther ?? '').trim();
    if (trimmed.length > 0) return trimmed;
    return locale === 'da' ? LABELS_DA.other : LABELS_EN.other;
  }
  return locale === 'da'
    ? LABELS_DA[profession]
    : LABELS_EN[profession];
}

/** The fixed list, as { code, label } pairs, for building a dropdown. */
export function professionOptions(
  locale: 'en' | 'da'
): { code: ProfessionCode; label: string }[] {
  const labels = locale === 'da' ? LABELS_DA : LABELS_EN;
  return PROFESSION_CODES.map((code) => ({ code, label: labels[code] }));
}
