'use client';

import { useTranslations } from 'next-intl';
import { formatLongDate } from '@/lib/dates';
import { groupTreatedMuscles } from '@/lib/types';
import { useModalA11y } from '@/lib/useModalA11y';

/**
 * Read-only pop-up showing which muscles the patient was treated on at
 * their most recent treatment. Opened from a quiet button on the home
 * screen, so the patient sees it only if they go looking.
 *
 * Rows are grouped per muscle with the sides combined (reusing the same
 * groupTreatedMuscles helper as the clinician/physiotherapist views). No
 * dosing or product detail is shown — just the muscle and the side.
 */
export function TreatedMusclesModal({
  date,
  muscles,
  locale,
  onClose
}: {
  date: string;
  muscles: { muscle: string; side: 'left' | 'right' | 'bilateral' }[];
  locale: string;
  onClose: () => void;
}) {
  const t = useTranslations('patient.home');
  const containerRef = useModalA11y(onClose);
  const grouped = groupTreatedMuscles(muscles);

  const sideLabel = (key: 'left' | 'right' | 'leftRight' | 'both') => {
    switch (key) {
      case 'left':
        return t('treatedSideLeft');
      case 'right':
        return t('treatedSideRight');
      case 'leftRight':
        return t('treatedSideLeftRight');
      case 'both':
        return t('treatedSideBoth');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('treatedMusclesTitle')}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-[var(--radius-card)] bg-cream p-4 shadow-xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[20px] leading-tight text-ink">
              {t('treatedMusclesTitle')}
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {t('treatedMusclesFrom', { date: formatLongDate(date, locale) })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 shrink-0 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink"
          >
            {t('graphClose')}
          </button>
        </div>

        {grouped.length === 0 ? (
          <p className="mt-4 text-[14px] text-ink-muted">
            {t('treatedMusclesNone')}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-stone/70 rounded-[var(--radius-button)] border border-stone bg-cream-soft">
            {grouped.map((g) => (
              <li
                key={g.muscle}
                className="flex items-baseline justify-between gap-3 px-4 py-2.5"
              >
                <span className="text-[15px] text-ink">{g.muscle}</span>
                <span className="shrink-0 text-[13px] text-ink-muted">
                  {sideLabel(g.sideKey)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
