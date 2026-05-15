'use client';

import type { GasAnchors, RatingValue } from '@/lib/types';

interface AnchorOption {
  key: string;
  value: -2 | -1 | 0 | 1 | 2;
  text: string;
  isExpected: boolean;
}

interface GoalRatingPickerProps {
  /** Patient-facing goal text, shown above the choices. */
  goalText: string;
  anchors: GasAnchors;
  value: Exclude<RatingValue, null> | undefined;
  onChange: (value: -2 | -1 | 0 | 1 | 2) => void;
  ariaLabel: string;
}

/**
 * Per-goal rating selector for the weekly check-in.
 *
 * Shows the patient-facing goal text at the top, followed by the five
 * goal-specific GAS anchor descriptions as tappable options. The middle
 * option ("what your team realistically expects") is visually highlighted
 * but never labelled with that phrase — the description carries the
 * meaning, the design carries the framing.
 *
 * No "not sure" option. Patients must pick one.
 *
 * Cards are large tap targets (min height comfortable for one-handed use).
 */
export function GoalRatingPicker({
  goalText,
  anchors,
  value,
  onChange,
  ariaLabel
}: GoalRatingPickerProps) {
  const options: AnchorOption[] = [
    { key: 'm2', value: -2, text: anchors.minus2, isExpected: false },
    { key: 'm1', value: -1, text: anchors.minus1, isExpected: false },
    { key: 'z', value: 0, text: anchors.zero, isExpected: true },
    { key: 'p1', value: 1, text: anchors.plus1, isExpected: false },
    { key: 'p2', value: 2, text: anchors.plus2, isExpected: false }
  ];

  return (
    <div>
      {/* Goal header — not a card. Quiet eyebrow + heading so the goal
          reads as the subject of the question, not a sixth choice. */}
      <div className="mb-6">
        <div className="eyebrow">Your goal</div>
        <p className="mt-1 font-display text-[22px] leading-snug text-ink">
          {goalText}
        </p>
        <div className="mt-4 h-px bg-stone" aria-hidden />
      </div>

      <div role="radiogroup" aria-label={ariaLabel} className="space-y-2">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <label
              key={opt.key}
              className={`block cursor-pointer rounded-[var(--radius-button)] border px-4 py-3.5 transition-colors ${
                selected
                  ? 'border-sage bg-sage-soft border-l-[5px]'
                  : opt.isExpected
                  ? 'border-sage/40 bg-sage-soft/40 border-l-[3px]'
                  : 'border-stone bg-cream-soft hover:bg-stone-soft'
              }`}
            >
              <input
                type="radio"
                name="goal-rating"
                value={String(opt.value)}
                checked={selected}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              <span
                className={`block text-[15px] leading-relaxed ${
                  selected ? 'text-sage-deep' : 'text-ink'
                }`}
              >
                {opt.text}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
