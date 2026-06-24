'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { todayIso } from '@/lib/dates';
import { useModalA11y } from '@/lib/useModalA11y';
import { useToast } from '@/components/feedback/Toast';

interface NewCycleDialogProps {
  onClose: () => void;
}

/**
 * Modal dialog asking the clinician to pick the date of the new
 * treatment injection.
 *
 * It does NOT create the cycle. It collects the date and navigates to
 * the treatment form with ?newCycle=1&date=…; the cycle is created
 * atomically WITH the treatment when the clinician records it (via
 * start_cycle_with_treatment). This means backing out of the treatment
 * form creates nothing — fixing the old bug where an empty cycle was
 * committed at confirm-time and a cancel couldn't undo it.
 */
export function NewCycleDialog({ onClose }: NewCycleDialogProps) {
  const router = useRouter();
  const locale = useLocale();
  const [date, setDate] = useState(todayIso());
  const toast = useToast();
  const tFeedback = useTranslations('feedback');
  const t = useTranslations('clinician.patient');

  const onConfirm = () => {
    if (!date) {
      toast.error(tFeedback('errorInvalidInput'));
      return;
    }
    // Do NOT create the cycle here. The cycle is created atomically
    // together with the treatment, when the clinician records it on the
    // treatment page — so backing out of that form creates nothing.
    // We just carry the chosen date forward as a query param.
    onClose();
    const base =
      locale === 'en' ? '/clinician/treatment' : `/${locale}/clinician/treatment`;
    router.push(`${base}?newCycle=1&date=${encodeURIComponent(date)}`);
  };

  const containerRef = useModalA11y(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-cycle-title"
        className="w-full max-w-[400px] rounded-[var(--radius-card)] border border-stone bg-cream p-6 shadow-xl"
      >
        <h2 id="new-cycle-title" className="font-display text-[20px] leading-tight text-ink">
          {t('newCycleDialogTitle')}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          {t('newCycleDialogBody')}
        </p>

        <label className="mt-5 block text-[14px] font-semibold text-ink">
          {t('newCycleDateLabel')}
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[15px] text-ink focus:border-sage focus:outline-none"
        />

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft"
          >
            {t('newCycleConfirm')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {t('newCycleCancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
