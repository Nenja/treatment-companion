'use client';

import { useTranslations } from 'next-intl';

interface CheckinDotsProps {
  totalWeeks: number;
  completedWeeks: Set<number>;
  pendingPromptWeek?: number;
}

export function CheckinDots({
  totalWeeks,
  completedWeeks,
  pendingPromptWeek
}: CheckinDotsProps) {
  const t = useTranslations('patient.home');
  const weeks = Array.from({ length: totalWeeks }, (_, i) => i + 1);

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
