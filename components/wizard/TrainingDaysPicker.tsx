'use client';

import { useTranslations } from 'next-intl';

/** [translation key for full name, ISO weekday number]. Monday-first. */
const DAYS: ReadonlyArray<[string, number]> = [
  ['mon', 1],
  ['tue', 2],
  ['wed', 3],
  ['thu', 4],
  ['fri', 5],
  ['sat', 6],
  ['sun', 7]
];

interface TrainingDaysPickerProps {
  /** Selected ISO weekday numbers (1=Mon..7=Sun). */
  value: number[];
  onChange: (days: number[]) => void;
  ariaLabel?: string;
}

/**
 * Seven day toggles for "which days did you train this week?". Multi-select;
 * tapping toggles a day on/off. An empty selection is valid (means "no
 * training this week"). Big, square targets so they're easy to hit with
 * reduced motor control.
 */
export function TrainingDaysPicker({
  value,
  onChange,
  ariaLabel
}: TrainingDaysPickerProps) {
  const t = useTranslations('training');
  const selected = new Set(value);

  const toggle = (iso: number) => {
    const next = new Set(selected);
    if (next.has(iso)) next.delete(iso);
    else next.add(iso);
    onChange(Array.from(next).sort((a, b) => a - b));
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? t('title')}
      className="grid grid-cols-7 gap-1.5 sm:gap-2"
    >
      {DAYS.map(([key, iso]) => {
        const on = selected.has(iso);
        return (
          <button
            key={iso}
            type="button"
            aria-pressed={on}
            aria-label={t(key)}
            onClick={() => toggle(iso)}
            className={[
              'flex aspect-square flex-col items-center justify-center rounded-[var(--radius-button)] border text-[14px] font-semibold transition-colors',
              on
                ? 'border-sage-deep bg-sage-deep text-on-accent'
                : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
            ].join(' ')}
          >
            <span>{t(`${key}Short`)}</span>
            {on && (
              <svg
                aria-hidden
                width="14"
                height="14"
                viewBox="0 0 16 16"
                className="mt-0.5"
              >
                <path
                  d="M3 8.5 L6.5 12 L13 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
