'use client';

import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { formatLongDate } from '@/lib/dates';

interface CheckinPromptCardProps {
  /** When set, the prompt is pending and the CTA is shown. */
  pendingPromptId?: string;
  /** When no prompt is pending, show this as the next-due date. */
  nextDueDate?: string;
  /** Patient ID for audit logging. */
  patientId: string;
  /**
   * When false (no active goals yet), the prompt CTA is suppressed.
   * Avoids routing the patient to a check-in flow with nothing to ask.
   */
  hasActiveGoals: boolean;
}

export function CheckinPromptCard({
  pendingPromptId,
  nextDueDate,
  patientId,
  hasActiveGoals
}: CheckinPromptCardProps) {
  const router = useRouter();
  const t = useTranslations('patient.home');
  const locale = useLocale();

  if (pendingPromptId && hasActiveGoals) {
    return (
      <section className="rounded-[var(--radius-card)] border border-sage/30 bg-sage-soft p-6">
        <h2 className="font-display text-[22px] leading-tight text-sage-deep">
          {t('checkinReadyTitle')}
        </h2>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          {t('checkinReadyBody')}
        </p>
        <button
          type="button"
          onClick={() => {
            // Audit logging happens server-side when the check-in is
            // actually submitted (submit_weekly_checkin RPC). No need
            // to log the navigation event here.
            router.push(locale === 'en' ? '/checkin' : `/${locale}/checkin`);
          }}
          className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-cream-soft hover:bg-ink-soft active:bg-ink"
        >
          {t('checkinReadyAction')}
          <span aria-hidden className="ml-2">
            →
          </span>
        </button>
      </section>
    );
  }

  if (nextDueDate && hasActiveGoals) {
    return (
      <section className="rounded-[var(--radius-card)] border border-stone bg-stone-soft p-5">
        <div className="eyebrow">{t('nextCheckinTitle')}</div>
        <p className="mt-1 text-[16px] text-ink">
          {t('nextCheckinBody', { date: formatLongDate(nextDueDate, locale) })}
        </p>
      </section>
    );
  }

  // No active goals → no check-in surface at all. The patient sees only
  // the empty-state goals card and the suggest-a-goal button.
  return null;
}
