'use client';

import { useTranslations } from 'next-intl';

interface CheckinDotsProps {
  /** Current week number since treatment (1-indexed). */
  currentWeek: number;
  completedWeeks: Set<number>;
  pendingPromptWeek?: number;
}

/**
 * Cycle progress, stated as a plain sentence.
 *
 * This was previously a strip of small circles (solid / ring / grey
 * ring). It needed a legend the patient never had — filled vs. ring
 * vs. grey-ring carried no self-evident meaning — and it quietly
 * tallied missed weeks, which reads as a guilt strip for a population
 * the app deliberately does not want to punish for gaps.
 *
 * A sentence is the "don't make me think" answer: the information,
 * stated, nothing to decode. It keeps the light "I'm keeping up"
 * reassurance without the missed-week scorekeeping — it counts only
 * completed check-ins, never absences.
 *
 * The component name is kept so existing imports are undisturbed.
 */
export function CheckinDots({ completedWeeks }: CheckinDotsProps) {
  const t = useTranslations('patient.home');
  const count = completedWeeks.size;

  // Nothing completed yet — say nothing rather than "0 check-ins",
  // which would land as a faintly negative note on a new patient's
  // first visit.
  if (count === 0) return null;

  return (
    <p className="mt-4 text-[14px] text-ink-soft">
      {t('checkinsThisCycle', { count })}
    </p>
  );
}
