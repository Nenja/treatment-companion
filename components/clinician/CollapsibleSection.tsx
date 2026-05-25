'use client';

import { useState, type ReactNode } from 'react';

/**
 * A collapsible section with a counted header.
 *
 * Used on the physician's patient page to keep a long page manageable:
 * the patient-suggestion and therapist-input sections collapse behind a
 * header that always shows a count, so the physician sees at a glance
 * whether anything needs attention without the sections taking over the
 * page.
 *
 * `defaultOpen` should be set true when the section has something
 * pending — anything the physician must act on stays visible without a
 * click; only handled / empty sections start collapsed. The count in
 * the header means a collapsed section is never silently ignored.
 *
 * Matches the chevron + header pattern of the app's other collapsibles
 * (CatchUpCard, the treated-muscles section).
 */
export function CollapsibleSection({
  title,
  subtitle,
  count,
  defaultOpen = false,
  children
}: {
  title: string;
  /** Optional one-line description under the title. */
  subtitle?: string;
  /** Shown as a small badge in the header. Pass the number of items
   *  the section contains (or items awaiting attention). */
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mt-10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-3 text-left hover:bg-stone-soft"
      >
        <span className="flex items-baseline gap-2">
          <span className="font-display text-[20px] leading-tight text-ink">
            {title}
          </span>
          {/* Count badge — sage when there is something, muted when
              empty, so a glance tells the physician if action waits. */}
          <span
            className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${
              count > 0
                ? 'bg-sage-soft text-sage-deep'
                : 'bg-stone-soft text-ink-muted'
            }`}
          >
            {count}
          </span>
        </span>
        <span
          aria-hidden
          className={`text-[14px] text-ink-muted transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="mt-3">
          {subtitle && (
            <p className="mb-3 text-[13px] text-ink-muted">{subtitle}</p>
          )}
          {children}
        </div>
      )}
    </section>
  );
}
