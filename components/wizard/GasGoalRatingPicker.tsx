'use client';

import { useTranslations } from 'next-intl';
import { ReadAloudButton } from '@/components/feedback/ReadAloudButton';

/**
 * Patient-facing rating control for a GAS goal.
 *
 * Unlike the NRS picker (a 0–10 tap scale), a GAS goal is rated by
 * picking one of five outcome levels directly. We show five big
 * buttons, one per level, stacked +2 (top) down to −2 (bottom) — the
 * same top-is-better orientation as the progress graph, so the colour
 * meaning the patient learns is consistent everywhere.
 *
 * Each button shows the level's plain meaning (e.g. "Much better than
 * expected"); if the clinician wrote an anchor sentence for that level,
 * it appears beneath as the concrete description. When anchors are
 * blank, the patient rates against the goal text using the generic
 * meanings alone — this is supported on purpose.
 *
 * Colour is anchored to meaning, matching the rest of the app: the two
 * "better" levels are sage, the expected level is neutral stone, the
 * two "below" levels are amber. The selected button fills solid.
 *
 * Stored value is a GAS integer (−2..2). Nothing is pre-selected.
 */

type Anchors = {
  minus2: string | null;
  minus1: string | null;
  zero: string | null;
  plus1: string | null;
  plus2: string | null;
} | null;

interface Level {
  value: 2 | 1 | 0 | -1 | -2;
  meaningKey: string;
  anchorKey: keyof NonNullable<Anchors>;
  tone: 'better' | 'expected' | 'below';
}

const LEVELS: Level[] = [
  { value: 2, meaningKey: 'gasMeaningMuchBetter', anchorKey: 'plus2', tone: 'better' },
  { value: 1, meaningKey: 'gasMeaningBetter', anchorKey: 'plus1', tone: 'better' },
  { value: 0, meaningKey: 'gasMeaningAsExpected', anchorKey: 'zero', tone: 'expected' },
  { value: -1, meaningKey: 'gasMeaningLess', anchorKey: 'minus1', tone: 'below' },
  { value: -2, meaningKey: 'gasMeaningMuchLess', anchorKey: 'minus2', tone: 'below' }
];

export function GasGoalRatingPicker({
  ariaLabel,
  goalText,
  anchors,
  value,
  onChange
}: {
  ariaLabel: string;
  goalText: string;
  anchors: Anchors;
  value: number | undefined;
  onChange: (value: number) => void;
}) {
  const t = useTranslations('patient.checkin');
  const interacted = typeof value === 'number';

  return (
    <div>
      {goalText && (
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-[20px] leading-snug text-ink">
            {goalText}
          </p>
          <ReadAloudButton text={`${goalText}. ${t('gasPrompt')}`} />
        </div>
      )}
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        {t('gasPrompt')}
      </p>

      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="mt-5 flex flex-col gap-2.5"
      >
        {LEVELS.map((lvl) => {
          const selected = interacted && value === lvl.value;
          const anchor = anchors ? anchors[lvl.anchorKey] : null;
          const meaning = t(lvl.meaningKey);

          // Colour by tone. Selected = solid fill; unselected = a tinted
          // outline in the same hue so the column reads as a gradient.
          const selectedClass =
            lvl.tone === 'better'
              ? 'border-sage-deep bg-sage-deep text-on-accent'
              : lvl.tone === 'below'
                ? 'border-amber-deep bg-amber-deep text-on-accent'
                : 'border-ink-soft bg-ink-soft text-on-accent';
          const idleClass =
            lvl.tone === 'better'
              ? 'border-sage/50 bg-sage-soft/40 text-ink hover:bg-sage-soft'
              : lvl.tone === 'below'
                ? 'border-amber-deep/40 bg-amber-soft/40 text-ink hover:bg-amber-soft'
                : 'border-stone bg-cream-soft text-ink hover:bg-stone-soft';

          // The level badge sign.
          const badge =
            lvl.value > 0 ? `+${lvl.value}` : `${lvl.value}`;
          const badgeIdleClass =
            lvl.tone === 'better'
              ? 'bg-sage-soft text-sage-deep'
              : lvl.tone === 'below'
                ? 'bg-amber-soft text-amber-deep'
                : 'bg-stone text-ink-soft';

          return (
            <button
              key={lvl.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${meaning}${anchor ? `: ${anchor}` : ''}`}
              onClick={() => onChange(lvl.value)}
              className={`flex w-full items-start gap-3 rounded-[var(--radius-card)] border-2 px-4 py-3.5 text-left transition-colors ${
                selected ? selectedClass : idleClass
              }`}
            >
              <span
                className={`inline-flex h-8 min-w-[2.25rem] shrink-0 items-center justify-center rounded-[var(--radius-button)] px-1.5 text-[16px] font-semibold tabular-nums ${
                  selected ? 'bg-white/20 text-on-accent' : badgeIdleClass
                }`}
              >
                {badge}
              </span>
              <span className="min-w-0">
                <span className="block text-[16px] font-semibold leading-snug">
                  {meaning}
                </span>
                {anchor && (
                  <span
                    className={`mt-0.5 block text-[14px] leading-snug ${
                      selected ? 'text-on-accent/90' : 'text-ink-soft'
                    }`}
                  >
                    {anchor}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {!interacted && (
        <p className="mt-6 text-center text-[14px] text-ink-muted">
          Tap the option that fits best.
        </p>
      )}
    </div>
  );
}
