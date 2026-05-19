'use client';

import { useTranslations } from 'next-intl';

interface CheckinDotsProps {
  /** Current week number since treatment (1-indexed). */
  currentWeek: number;
  completedWeeks: Set<number>;
  pendingPromptWeek?: number;
}

/**
 * Visual cycle progress: one circle per week up to current.
 *
 *   ●  solid sage      = check-in completed for that week
 *   ⊙  sage ring       = current pending prompt (this is "now")
 *   ○  grey ring       = skipped past week
 *
 * The strip grows by one dot each week — no fixed cap is shown.
 * Skipped past weeks render identically to current to avoid punishing
 * missed entries.
 */
export function CheckinDots({
  currentWeek,
  completedWeeks,
  pendingPromptWeek
}: CheckinDotsProps) {
  const t = useTranslations('patient.home');
  const weeks = Array.from({ length: Math.max(1, currentWeek) }, (_, i) => i + 1);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1.5" aria-hidden>
        {weeks.map((w) => {
          const isCompleted = completedWeeks.has(w);
          const isCurrent = w === pendingPromptWeek;

          let className = 'h-3 w-3 rounded-full ';
          if (isCompleted) {
            className += 'bg-sage';
          } else if (isCurrent) {
            className += 'border-2 border-sage';
          } else {
            className += 'border-2 border-ink-muted';
          }

          return <div key={w} className={className} />;
        })}
      </div>
      <p className="sr-only">
        {t('checkinsThisCycle', { count: completedWeeks.size })}
      </p>
    </div>
  );
}
