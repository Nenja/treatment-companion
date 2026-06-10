'use client';

import type { NrsDirection } from '@/lib/types';
import { ReadAloudButton } from '@/components/feedback/ReadAloudButton';

interface GoalRatingPickerProps {
  ariaLabel: string;
  goalText: string;
  /** The clinician-written NRS question for this goal. */
  question: string;
  direction: NrsDirection;
  /** Current value, 0-10. Undefined when not yet picked. */
  value: number | undefined;
  onChange: (value: number) => void;
}

/**
 * Patient-facing 0-10 rating control for a single goal.
 *
 * This is a TAP SCALE, not a slider. The target group (adults with
 * spasticity — hemiparesis, tremor, limited fine-motor control) finds
 * landing precisely on a slider value genuinely hard, and a slider
 * also shows a pre-positioned thumb that can be misread as an answer
 * the patient never gave. Eleven discrete buttons fix both: one tap
 * per rating, nothing pre-selected, no fine-motor demand.
 *
 * Layout: two rows (0-5, then 6-10) so every button stays comfortably
 * above a 44px tap target on a phone.
 *
 * Direction handling — the consistency fix:
 *   Earlier, endpoint labels flipped per goal ("0 = Best" on one goal,
 *   "0 = Worst" on the next), so the same number meant opposite things
 *   on adjacent screens. Now MEANING IS ANCHORED TO COLOUR: the "good"
 *   end is always sage, the "poor" end always amber, whichever numeric
 *   end that is. The patient learns the colour once; the number's
 *   position no longer has to be re-interpreted each goal.
 *
 * Stored value is unchanged — still a 0-10 integer. Only the input
 * control changed; submit + NRS->GAS mapping are untouched.
 */
export function GoalRatingPicker({
  ariaLabel,
  goalText,
  question,
  direction,
  value,
  onChange
}: GoalRatingPickerProps) {
  const interacted = typeof value === 'number';

  // Which numeric end is "good"? higherIsBetter -> 10 is good;
  // lowerIsBetter -> 0 is good. Used only for colour + end labels.
  const goodIsHigh = direction === 'higherIsBetter';
  const lowLabel = goodIsHigh ? 'Worst' : 'Best';
  const highLabel = goodIsHigh ? 'Best' : 'Worst';

  // Tint a number by how "good" it is, so the row reads as a gradient
  // from poor to good in the SAME direction the colour always means.
  // goodness: 0 (poor) .. 1 (good).
  const goodness = (n: number) => (goodIsHigh ? n / 10 : 1 - n / 10);

  const rows = [
    [0, 1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10]
  ];

  return (
    <div>
      {goalText && (
        <div className="flex items-start justify-between gap-2">
          <h1 className="font-display text-[22px] leading-snug text-ink">
            {goalText}
          </h1>
          <ReadAloudButton text={`${goalText}. ${question}`} />
        </div>
      )}
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        {question}
      </p>

      <div className="mt-6 flex flex-col items-center">
        {/* Big numeric display of the current pick. */}
        <div
          aria-live="polite"
          className="font-display tabular-nums leading-none"
        >
          <span
            className={`text-[72px] ${
              interacted ? 'text-ink' : 'text-ink-muted'
            }`}
          >
            {interacted ? value : '\u2014'}
          </span>
          <span className="ml-2 align-top text-[20px] text-ink-muted">
            / 10
          </span>
        </div>

        {/* The 0-10 tap scale — a radiogroup so arrow keys work and a
            screen reader announces it as a single rating control. */}
        <div
          role="radiogroup"
          aria-label={ariaLabel}
          className="mt-6 flex w-full max-w-[420px] flex-col gap-2"
        >
          {rows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex justify-center gap-2">
              {row.map((n) => {
                const selected = interacted && value === n;
                const g = goodness(n);
                // Unselected buttons carry a faint tint toward their
                // end's colour; the selected one is fully filled.
                const tint =
                  g >= 0.6
                    ? 'border-sage/50'
                    : g <= 0.4
                      ? 'border-amber-deep/40'
                      : 'border-stone';
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${n}${
                      n === 0
                        ? `, ${lowLabel}`
                        : n === 10
                          ? `, ${highLabel}`
                          : ''
                    }`}
                    onClick={() => onChange(n)}
                    className={`flex h-12 w-12 items-center justify-center rounded-[var(--radius-button)] border-2 text-[20px] font-semibold tabular-nums transition-colors ${
                      selected
                        ? 'border-sage-deep bg-sage-deep text-on-accent'
                        : `${tint} bg-cream-soft text-ink hover:bg-stone-soft`
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Endpoint labels — words reinforced by the end colours. The
            colour is the constant; the words confirm it. */}
        <div className="mt-3 flex w-full max-w-[420px] justify-between text-[14px] font-semibold uppercase tracking-wider">
          <span className={goodIsHigh ? 'text-amber-deep' : 'text-sage-deep'}>
            0 · {lowLabel}
          </span>
          <span className={goodIsHigh ? 'text-sage-deep' : 'text-amber-deep'}>
            10 · {highLabel}
          </span>
        </div>
      </div>

      {!interacted && (
        <p className="mt-6 text-center text-[14px] text-ink-muted">
          Tap a number to choose your rating.
        </p>
      )}
    </div>
  );
}
