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
          className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft active:bg-ink"
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
    // "All caught up" — nothing due. This should read as a calm,
    // resolved state, not a muted task. A checkmark + affirming title
    // make it clearly "you're done", with the next date as quiet
    // supporting detail.
    return (
      <section className="rounded-[var(--radius-card)] border border-sage/30 bg-cream-soft p-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-soft text-[18px] text-sage-deep"
          >
            ✓
          </span>
          <div>
            <p className="font-display text-[18px] leading-snug text-ink">
              {t('allCaughtUpTitle')}
            </p>
            <p className="mt-1 text-[14px] text-ink-soft">
              {t('nextCheckinBody', {
                date: formatLongDate(nextDueDate, locale)
              })}
            </p>
          </div>
        </div>
      </section>
    );
  }

  // No active goals → no check-in surface at all. The patient sees only
  // the empty-state goals card and the suggest-a-goal button.
  return null;
}
