'use client';

import { useTranslations, useLocale } from 'next-intl';
import { actions } from '@/lib/store';
import { formatLongDate } from '@/lib/dates';

interface CheckinPromptCardProps {
  /** When set, the prompt is pending and the CTA is shown. */
  pendingPromptId?: string;
  /** When no prompt is pending, show this as the next-due date. */
  nextDueDate?: string;
  /** Patient ID for audit logging. */
  patientId: string;
}

export function CheckinPromptCard({
  pendingPromptId,
  nextDueDate,
  patientId
}: CheckinPromptCardProps) {
  const t = useTranslations('patient.home');
  const locale = useLocale();

  if (pendingPromptId) {
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
          onClick={() =>
            actions.log({
              actorId: patientId,
              actorRole: 'patient',
              action: 'checkin_started',
              entity: 'weekly_prompt',
              entityId: pendingPromptId
            })
          }
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

  if (nextDueDate) {
    return (
      <section className="rounded-[var(--radius-card)] border border-stone bg-stone-soft p-5">
        <div className="eyebrow">{t('nextCheckinTitle')}</div>
        <p className="mt-1 text-[16px] text-ink">
          {t('nextCheckinBody', { date: formatLongDate(nextDueDate, locale) })}
        </p>
      </section>
    );
  }

  return null;
}
