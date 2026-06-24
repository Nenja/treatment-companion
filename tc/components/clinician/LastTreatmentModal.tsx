'use client';

import { useTranslations } from 'next-intl';
import { formatLongDate } from '@/lib/dates';
import { useModalA11y } from '@/lib/useModalA11y';
import type { GuidanceMethod, InjectionSide } from '@/lib/types';

interface LastTreatmentInjection {
  muscle: string;
  side: InjectionSide;
  doseUnits: number;
  note?: string;
  isFace?: boolean;
}

export interface LastTreatment {
  date: string;
  drugProduct: string;
  totalUnits: number;
  dilution?: string;
  guidance: GuidanceMethod;
  injections: LastTreatmentInjection[];
  notes?: string;
}

/**
 * Read-only dialog showing the most recent treatment recorded for the
 * cycle — opened from the "since last treatment" section so the clinician
 * can glance at what was injected last time without leaving the cockpit.
 *
 * Reuses the `ehrExport` label vocabulary (date / units / guidance /
 * injection line / sides / notes) so the wording matches the EHR-paste
 * export and stays localised.
 */
export function LastTreatmentModal({
  treatment,
  locale,
  onClose
}: {
  treatment: LastTreatment;
  locale: string;
  onClose: () => void;
}) {
  const tA11y = useTranslations('a11y');
  const t = useTranslations('lastTreatment');
  const te = useTranslations('ehrExport');
  const containerRef = useModalA11y(onClose);

  const guidanceLabel = te(`guidance_${treatment.guidance}` as 'guidance_emg');
  const sideLabel = (s: InjectionSide) => te(`side_${s}` as 'side_left');

  const standard = treatment.injections.filter((i) => !i.isFace);
  const face = treatment.injections.filter((i) => i.isFace);

  const renderInjection = (i: LastTreatmentInjection, idx: number) => (
    <li key={`${i.muscle}-${i.side}-${idx}`} className="text-[14px] text-ink-soft">
      {te('injectionLine', {
        muscle: i.muscle,
        side: sideLabel(i.side),
        units: i.doseUnits,
        note: i.note ? ` — ${i.note}` : ''
      }).replace(/^- /, '')}
    </li>
  );

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
        aria-label={t('title')}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-[var(--radius-card)] bg-cream p-4 shadow-xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[20px] leading-tight text-ink">
              {t('title')}
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {formatLongDate(treatment.date, locale)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tA11y('close')}
            className="flex h-9 shrink-0 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink"
          >
            ✕
          </button>
        </div>

        <p className="mt-3 text-[14px] text-ink-soft">
          {treatment.drugProduct} · {te('unitsTotal', { units: treatment.totalUnits })}
          {treatment.dilution
            ? ` · ${te('dilution', { dilution: treatment.dilution })}`
            : ''}{' '}
          · {te('guidance', { guidance: guidanceLabel })}
        </p>

        {standard.length > 0 && (
          <div className="mt-4">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-ink-muted">
              {te('injectionsHeading')}
            </h3>
            <ul className="mt-1.5 space-y-1">
              {standard.map(renderInjection)}
            </ul>
          </div>
        )}

        {face.length > 0 && (
          <div className="mt-4">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-ink-muted">
              {te('faceInjectionsHeading')}
            </h3>
            <ul className="mt-1.5 space-y-1">{face.map(renderInjection)}</ul>
          </div>
        )}

        {treatment.notes && (
          <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-soft">
            {te('notes', { notes: treatment.notes })}
          </p>
        )}
      </div>
    </div>
  );
}
