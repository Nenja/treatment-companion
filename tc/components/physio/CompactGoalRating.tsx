'use client';

import { useTranslations } from 'next-intl';

type Direction = 'higherIsBetter' | 'lowerIsBetter';

interface CompactGoalRatingProps {
  ariaLabel: string;
  kind: 'nrs' | 'gas';
  /** NRS only — which way is better. */
  direction?: Direction;
  /** GAS only — the goal's per-level anchor sentences (may be null). */
  anchors?: {
    minus2: string | null;
    minus1: string | null;
    zero: string | null;
    plus1: string | null;
    plus2: string | null;
  } | null;
  value: number | undefined;
  onChange: (v: number) => void;
}

const GAS = [
  { v: -2, meaning: 'gasMeaningMuchLess', anchor: 'minus2', tone: 'below' },
  { v: -1, meaning: 'gasMeaningLess', anchor: 'minus1', tone: 'below' },
  { v: 0, meaning: 'gasMeaningAsExpected', anchor: 'zero', tone: 'expected' },
  { v: 1, meaning: 'gasMeaningBetter', anchor: 'plus1', tone: 'better' },
  { v: 2, meaning: 'gasMeaningMuchBetter', anchor: 'plus2', tone: 'better' }
] as const;

/**
 * Compact, clinician-oriented rating control for the therapist visit form.
 *
 * Same 0-10 / GAS scale and stored values as the patient's check-in pickers,
 * but dense — one row of small buttons — and without the patient-facing
 * question, the "worst / best" reassurance, or the "tap a number" helper.
 * The therapist knows the scale; this is quick entry, not a guided
 * self-report. For NRS we show only which direction is better; for GAS the
 * level's meaning (and the goal's own anchor, when present) surfaces once a
 * level is picked.
 */
export function CompactGoalRating({
  ariaLabel,
  kind,
  direction,
  anchors,
  value,
  onChange
}: CompactGoalRatingProps) {
  const tGas = useTranslations('patient.checkin');
  const tDir = useTranslations('clinician.approve');

  if (kind === 'gas') {
    const sel = GAS.find((l) => l.v === value) ?? null;
    const anchorText = sel && anchors ? anchors[sel.anchor] : null;
    return (
      <div role="group" aria-label={ariaLabel}>
        <div className="flex gap-1.5">
          {GAS.map((l) => {
            const on = value === l.v;
            const onTone =
              l.tone === 'better'
                ? 'border-sage-deep bg-sage-deep text-on-accent'
                : l.tone === 'below'
                  ? 'border-amber-deep bg-amber-deep text-on-accent'
                  : 'border-ink-soft bg-ink-soft text-on-accent';
            return (
              <button
                key={l.v}
                type="button"
                onClick={() => onChange(l.v)}
                aria-pressed={on}
                className={`h-9 flex-1 rounded-[8px] border text-[14px] font-semibold ${
                  on
                    ? onTone
                    : 'border-stone bg-cream text-ink-soft hover:border-ink-muted'
                }`}
              >
                {l.v > 0 ? `+${l.v}` : l.v}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] leading-snug text-ink-soft">
          {sel ? (
            <>
              <span className="font-semibold">{tGas(sel.meaning)}</span>
              {anchorText ? ` — ${anchorText}` : ''}
            </>
          ) : (
            <span className="text-ink-muted">
              {tGas('gasMeaningMuchLess')} … {tGas('gasMeaningMuchBetter')}
            </span>
          )}
        </p>
      </div>
    );
  }

  return (
    <div role="group" aria-label={ariaLabel}>
      {direction && (
        <p className="text-[12px] text-ink-muted">
          {direction === 'higherIsBetter'
            ? tDir('higherIsBetter')
            : tDir('lowerIsBetter')}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Array.from({ length: 11 }, (_, n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-pressed={on}
              className={`h-8 min-w-[30px] rounded-[7px] border px-1 text-[13px] ${
                on
                  ? 'border-sage-deep bg-sage-deep font-semibold text-on-accent'
                  : 'border-stone bg-cream text-ink-soft hover:border-ink-muted'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
