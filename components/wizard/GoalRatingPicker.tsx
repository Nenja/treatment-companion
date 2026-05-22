'use client';

import type { NrsDirection } from '@/lib/types';

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
 * Patient-facing NRS slider for a single goal.
 *
 *  - Big numeric display above the slider showing current value
 *  - Native range input 0..10 (step 1), styled to match the app
 *  - Endpoint labels reflect the goal's direction:
 *      higherIsBetter:  0 = Worst   10 = Best
 *      lowerIsBetter:   0 = Best    10 = Worst
 *  - Until the patient interacts at least once, the value remains
 *    undefined so we know they haven't answered yet. We initialise
 *    the visible slider to 5 (midpoint) but don't count it as
 *    "selected" until they move it or tap.
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
  // Displayed slider position. Falls back to 5 when no value yet, so
  // the thumb has somewhere to live before interaction.
  const sliderValue = interacted ? value! : 5;

  const lowLabel = direction === 'higherIsBetter' ? 'Worst' : 'Best';
  const highLabel = direction === 'higherIsBetter' ? 'Best' : 'Worst';

  return (
    <div>
      {goalText && (
        <p className="font-display text-[20px] leading-snug text-ink">
          {goalText}
        </p>
      )}
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        {question}
      </p>

      <div
        className="mt-6 flex flex-col items-center"
        aria-label={ariaLabel}
      >
        {/* Big numeric display */}
        <div
          aria-live="polite"
          className={`font-display tabular-nums leading-none ${
            interacted ? 'text-[72px] text-ink' : 'text-[72px] text-ink-muted'
          }`}
        >
          {interacted ? value : '—'}
          <span className="ml-2 align-top text-[20px] text-ink-muted">
            / 10
          </span>
        </div>

        {/* Slider + ± buttons row.
            ± buttons offer an alternative for patients with tremor or
            limited fine motor control. They sit either side of the
            slider, large enough for confident one-finger taps. Tapping
            outside [0,10] is a no-op (button disables at the bound). */}
        <div className="mt-6 flex w-full max-w-[400px] items-center gap-3">
          <button
            type="button"
            onClick={() => onChange(Math.max(0, sliderValue - 1))}
            disabled={interacted && value === 0}
            aria-label={`Decrease by 1${interacted ? `, currently ${value}` : ''}`}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-sage-deep bg-cream-soft text-[28px] font-semibold leading-none text-sage-deep hover:bg-sage-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            −
          </button>

          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={sliderValue}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label={ariaLabel}
            className="h-3 flex-1 cursor-pointer appearance-none rounded-full bg-stone accent-sage-deep
              [&::-webkit-slider-thumb]:h-10 [&::-webkit-slider-thumb]:w-10
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-sage-deep
              [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-cream
              [&::-webkit-slider-thumb]:shadow-md
              [&::-webkit-slider-thumb]:cursor-grab
              [&::-moz-range-thumb]:h-10 [&::-moz-range-thumb]:w-10
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-sage-deep
              [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-cream
              [&::-moz-range-thumb]:cursor-grab"
          />

          <button
            type="button"
            onClick={() => onChange(Math.min(10, sliderValue + 1))}
            disabled={interacted && value === 10}
            aria-label={`Increase by 1${interacted ? `, currently ${value}` : ''}`}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-sage-deep bg-cream-soft text-[28px] font-semibold leading-none text-sage-deep hover:bg-sage-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
        </div>

        {/* Endpoint labels */}
        <div className="mt-3 flex w-full max-w-[400px] justify-between text-[14px] uppercase tracking-wider text-ink-muted">
          <span>0 · {lowLabel}</span>
          <span>10 · {highLabel}</span>
        </div>
      </div>

      {!interacted && (
        <p className="mt-6 text-center text-[14px] text-ink-muted">
          Move the slider to choose your rating.
        </p>
      )}
    </div>
  );
}
