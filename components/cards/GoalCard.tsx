import { useTranslations, useLocale } from 'next-intl';
import type { ApprovedGoal } from '@/lib/types';
import { formatLongDate } from '@/lib/dates';

interface GoalCardProps {
  goal: ApprovedGoal;
  reviewDate: string;
}

export function GoalCard({ goal, reviewDate }: GoalCardProps) {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <article className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5">
      <h3 className="font-display text-[20px] leading-snug text-ink">
        {goal.patientFacingText}
      </h3>

      <p className="mt-2 text-[13px] text-ink-muted">
        {t('goal.reviewDate', { date: formatLongDate(reviewDate, locale) })}
      </p>
    </article>
  );
}
