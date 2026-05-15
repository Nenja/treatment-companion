'use client';

import type { ReactNode } from 'react';

export interface OptionItem<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface OptionListProps<T extends string> {
  options: OptionItem<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  /** Accessible name for the radio group. */
  name: string;
  ariaLabel: string;
}

/**
 * A vertical list of large tappable option cards used by the suggest-goal
 * wizard for single-select steps (domain, importance, timeframe).
 *
 * Designed with one-handed use and motor impairment in mind:
 *   - Each option is a full-width card (min height ~56px)
 *   - The whole card is the tap target, not just the text
 *   - Selected state uses both a colour change AND a left bar, so it
 *     stays distinguishable for people with low colour vision
 *   - Native radio inputs (visually hidden) keep keyboard nav working
 */
export function OptionList<T extends string>({
  options,
  value,
  onChange,
  name,
  ariaLabel
}: OptionListProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="space-y-2">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <label
            key={opt.value}
            className={`block cursor-pointer rounded-[var(--radius-button)] border px-4 py-3.5 transition-colors ${
              selected
                ? 'border-sage bg-sage-soft border-l-[5px]'
                : 'border-stone bg-cream-soft hover:bg-stone-soft'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <span
              className={`block text-[16px] font-semibold leading-snug ${
                selected ? 'text-sage-deep' : 'text-ink'
              }`}
            >
              {opt.label}
            </span>
            {opt.description && (
              <span className="mt-0.5 block text-[13px] text-ink-soft">
                {opt.description}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

/** Helper: convenience wrapper for the textual examples block in step 2. */
export function ExamplesBlock({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="mt-4 rounded-[var(--radius-button)] border border-stone bg-cream-soft/60 p-3 text-[14px]">
      <summary className="cursor-pointer font-semibold text-ink-soft">
        {title}
      </summary>
      <ul className="mt-2 space-y-1.5 pl-1 text-ink-soft">{children}</ul>
    </details>
  );
}
