'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * A collapsible section with a counted header.
 *
 * Used on the physician's patient page to keep a long page manageable:
 * the patient-suggestion and therapist-input sections collapse behind a
 * header that always shows a count, so the physician sees at a glance
 * whether anything needs attention without the sections taking over the
 * page.
 *
 * Sections are collapsed by default. The count badge does the
 * attention-drawing job — it shows how many ACTIVE (unhandled) items
 * the section holds, so a collapsed section is never silently ignored.
 *
 * `anchorId` ties the section to a URL hash: if the page is loaded or
 * navigated to with that hash (e.g. the "you have suggestions" banner
 * links to #patient-suggestions), the section opens automatically and
 * scrolls into view — so a jump-link never lands on a collapsed,
 * hidden section.
 *
 * Matches the chevron + header pattern of the app's other collapsibles
 * (CatchUpCard, the treated-muscles section).
 */
export function CollapsibleSection({
  title,
  subtitle,
  count,
  anchorId,
  children
}: {
  title: string;
  /** Optional one-line description under the title. */
  subtitle?: string;
  /** Number of active/unhandled items — shown as a header badge. */
  count: number;
  /** Optional id; also used as the URL-hash anchor that auto-opens
   *  this section when navigated to. */
  anchorId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Open automatically when the URL hash points at this section, so a
  // jump-link (e.g. the suggestions banner) lands on an OPEN section.
  useEffect(() => {
    if (!anchorId || typeof window === 'undefined') return;
    const matchesHash = () =>
      window.location.hash.replace(/^#/, '') === anchorId;
    if (matchesHash()) setOpen(true);
    const onHashChange = () => {
      if (matchesHash()) setOpen(true);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [anchorId]);

  return (
    <section className="mt-10" id={anchorId}>
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
