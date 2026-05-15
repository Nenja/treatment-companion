'use client';

import { useTranslations } from 'next-intl';
import type { GasAnchors, RatingValue } from '@/lib/types';

interface GoalRatingPickerProps {
  goalText: string;
  anchors: GasAnchors;
  value: Exclude<RatingValue, null> | undefined;
  onChange: (value: -2 | -1 | 0 | 1 | 2) => void;
  ariaLabel: string;
}

/**
 * Horizontal 5-point scale.
 *
 * Visual-first: big dots in a row, no per-dot text. Direction is implied
 * by the muted amber → cream → sage palette. The middle dot is slightly
 * larger than its neighbours; we no longer show a permanent tick — the
 * size difference is enough.
 *
 * The selected option's goal-specific anchor text appears as a caption
 * directly below the row. Before any selection, a quiet prompt sits in
 * its place so the area never empties out.
 */
export function GoalRatingPicker({
  goalText,
  anchors,
  value,
  onChange,
  ariaLabel
}: GoalRatingPickerProps) {
  const t = useTranslations('patient.checkin');

  const points = [
    {
      value: -2 as const,
      text: anchors.minus2,
      bgUnselected: 'bg-amber-soft/60',
      bgSelected: 'bg-amber-soft',
      size: 52,
      shortLabel: t('scaleMuchHarder')
    },
    {
      value: -1 as const,
      text: anchors.minus1,
      bgUnselected: 'bg-amber-soft/30',
      bgSelected: 'bg-amber-soft/80',
      size: 44,
      shortLabel: t('scaleALittleHarder')
    },
    {
      value: 0 as const,
      text: anchors.zero,
      bgUnselected: 'bg-stone-soft',
      bgSelected: 'bg-cream',
      size: 60,
      shortLabel: t('scaleAsExpected')
    },
    {
      value: 1 as const,
      text: anchors.plus1,
      bgUnselected: 'bg-sage-soft/60',
      bgSelected: 'bg-sage-soft',
      size: 44,
      shortLabel: t('scaleBetter')
    },
    {
      value: 2 as const,
      text: anchors.plus2,
      bgUnselected: 'bg-sage/40',
      bgSelected: 'bg-sage/80',
      size: 52,
      shortLabel: t('scaleMuchBetter')
    }
  ];

  const selectedPoint = points.find((p) => p.value === value);

  return (
    <div>
      {/* Goal header */}
      <div className="mb-8">
        <div className="eyebrow">{t('scaleYourGoal')}</div>
        <p className="mt-1 font-display text-[22px] leading-snug text-ink">
          {goalText}
        </p>
      </div>

      {/* Scale row */}
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="flex items-center justify-between gap-2"
      >
        {points.map((p) => {
          const selected = value === p.value;
          return (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={p.shortLabel}
              onClick={() => onChange(p.value)}
              className="flex min-w-0 flex-1 items-center justify-center rounded-lg py-3 hover:bg-stone-soft/40 focus-visible:bg-stone-soft/40"
            >
              <span
                aria-hidden
                style={{ width: `${p.size}px`, height: `${p.size}px` }}
                className={`inline-block rounded-full transition-all ${
                  selected
                    ? `${p.bgSelected} ring-[3px] ring-sage ring-offset-2 ring-offset-cream`
                    : `${p.bgUnselected} border border-stone`
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* Caption: anchor text for selected dot, or quiet prompt */}
      <div className="mt-6 min-h-[72px]">
        {selectedPoint ? (
          <>
            <div className="eyebrow text-sage-deep">
              {selectedPoint.shortLabel}
            </div>
            <p className="mt-1 text-[15px] leading-relaxed text-ink">
              {selectedPoint.text}
            </p>
          </>
        ) : (
          <p className="text-center text-[14px] leading-relaxed text-ink-muted">
            {t('scaleTapPrompt')}
          </p>
        )}
      </div>
    </div>
  );
}
