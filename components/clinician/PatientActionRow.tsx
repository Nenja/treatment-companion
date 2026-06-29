'use client';

import { useTranslations } from 'next-intl';

/**
 * Horizontal action row for the clinician patient page.
 *
 * Entry points, always visible under the patient name, in review-first order:
 *   - history          (navigates to the longitudinal record)
 *   - questionnaires   (opens the questionnaire panel)
 *   - training         (count badge — opens an inline panel)
 *   - export           (opens the EHR-note export modal)
 *   - consent          (the shield/video button — opens the consent panel)
 *   - admin            (admins only — navigates to the global admin page)
 *
 * The row only renders the buttons and their count badges, and reports
 * taps via onSelect. WHAT happens on tap (open a panel, navigate, open
 * a modal) is decided by the page — the row stays a dumb, testable
 * presentational component.
 *
 * Counts hide at zero: a badge appears only when that item has
 * something waiting, so the badge appearing is itself the signal.
 * The currently-open panel item is shown filled (active).
 *
 * Icons are minimal inline line-SVG to match the app's restraint (no
 * icon library is bundled).
 */

export type PatientActionId = 'medication' | 'physio' | 'history' | 'export' | 'training' | 'video' | 'questionnaires' | 'admin';

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-cream bg-amber-deep px-1 text-[10px] font-bold text-on-accent"
    >
      {count}
    </span>
  );
}

function iconFor(id: PatientActionId) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  };
  switch (id) {
    case 'medication':
      // pill / capsule
      return (
        <svg {...common}>
          <path d="M10.5 20.5a4.95 4.95 0 0 1-7-7l6-6a4.95 4.95 0 0 1 7 7l-6 6z" />
          <path d="M8.5 8.5l7 7" />
        </svg>
      );
    case 'physio':
      // clipboard / assessment
      return (
        <svg {...common}>
          <path d="M9 2h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="M9 12h6M9 16h4" />
        </svg>
      );
    case 'history':
      // line chart / trend
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <path d="M7 14l3-4 3 3 4-6" />
        </svg>
      );
    case 'export':
      // download / export
      return (
        <svg {...common}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5 5 5-5" />
          <path d="M12 15V3" />
        </svg>
      );
    case 'training':
      // dumbbell / training
      return (
        <svg {...common}>
          <path d="M6 7v10M18 7v10M3 10v4M21 10v4" />
          <path d="M6 12h12" />
        </svg>
      );
    case 'video':
      // shield with a check — this entry point is now "Consent"
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case 'questionnaires':
      // survey / form — radio dots beside lines
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <circle cx="8" cy="8" r="1" />
          <circle cx="8" cy="13" r="1" />
          <circle cx="8" cy="18" r="1" />
          <path d="M11 8h6M11 13h6M11 18h4" />
        </svg>
      );
    case 'admin':
      // gear / settings — admin tools (account management, research export)
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V15z" />
        </svg>
      );
  }
}

export function PatientActionRow({
  physioCount,
  openPanel,
  onSelect,
  labels,
  shortLabels,
  variant = 'row',
  showAdmin = false,
  className = ''
}: {
  physioCount: number;
  /** Which inline panel is currently open, if any. */
  openPanel: 'medication' | 'physio' | 'training' | null;
  onSelect: (id: PatientActionId) => void;
  /** Full labels — used for the accessible name (with count). */
  labels: Record<PatientActionId, string>;
  /** Short one-word labels shown visibly under each icon. Optional —
   *  falls back to the full labels if not provided, so the row can
   *  never fail to compile on a brief page/component mismatch. */
  shortLabels?: Record<PatientActionId, string>;
  /** 'row' (default) = full-width stacked icon buttons under the name;
   *  'toolbar' = compact inline icon+label buttons for the wide-layout
   *  header; 'sidebar' = a vertical icon+label rail down the left edge.
   *  All report taps the same way. */
  variant?: 'row' | 'toolbar' | 'sidebar';
  /** Append an Admin entry (navigates to the admin page). Gated by the
   *  page to admins only — it's a global tool, not patient-scoped. */
  showAdmin?: boolean;
  /** Extra classes appended to the root (e.g. responsive show/hide). */
  className?: string;
}) {
  const tA11y = useTranslations('a11y');
  const items: { id: PatientActionId; count?: number }[] = [
    { id: 'history' },
    { id: 'questionnaires' },
    { id: 'training' },
    { id: 'export' },
    { id: 'video' },
    ...(showAdmin ? [{ id: 'admin' as const }] : [])
  ];

  if (variant === 'toolbar') {
    return (
      <div
        className={`flex flex-wrap items-center gap-1.5 ${className}`}
        role="group"
        aria-label={tA11y('patientActions')}
      >
        {items.map(({ id, count }) => {
          const isActive = openPanel === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-label={
                count && count > 0 ? `${labels[id]} (${count})` : labels[id]
              }
              aria-pressed={isActive}
              className={`relative flex items-center gap-1.5 rounded-[var(--radius-button)] border px-2.5 py-1.5 text-[13px] font-semibold transition-colors [&_svg]:h-[17px] [&_svg]:w-[17px] ${
                isActive
                  ? 'border-sage-deep bg-sage-deep text-on-accent'
                  : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
              }`}
            >
              {iconFor(id)}
              <span className="leading-tight">
                {(shortLabels ?? labels)[id]}
              </span>
              {typeof count === 'number' && <Badge count={count} />}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 'sidebar') {
    return (
      <nav
        className={`flex flex-col gap-1.5 ${className}`}
        aria-label={tA11y('patientActions')}
      >
        {items.map(({ id, count }) => {
          const isActive = openPanel === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-label={
                count && count > 0 ? `${labels[id]} (${count})` : labels[id]
              }
              aria-pressed={isActive}
              className={`relative flex w-[68px] flex-col items-center justify-center gap-1 rounded-[var(--radius-button)] border px-1 py-2.5 transition-colors [&_svg]:h-5 [&_svg]:w-5 ${
                isActive
                  ? 'border-sage-deep bg-sage-deep text-on-accent'
                  : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
              }`}
            >
              {iconFor(id)}
              <span className="text-[11px] leading-tight">
                {(shortLabels ?? labels)[id]}
              </span>
              {typeof count === 'number' && <Badge count={count} />}
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <div
      className={`mt-5 flex gap-2 ${className}`}
      role="group"
      aria-label={tA11y('patientActions')}
    >
      {items.map(({ id, count }) => {
        const isActive = openPanel === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-label={
              count && count > 0
                ? `${labels[id]} (${count})`
                : labels[id]
            }
            aria-pressed={isActive}
            className={`relative flex flex-1 flex-col items-center justify-center gap-1 rounded-[var(--radius-button)] border px-1 py-2 transition-colors ${
              isActive
                ? 'border-sage-deep bg-sage-deep text-on-accent'
                : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
            }`}
          >
            {iconFor(id)}
            <span className="text-[11px] leading-tight">
              {(shortLabels ?? labels)[id]}
            </span>
            {typeof count === 'number' && <Badge count={count} />}
          </button>
        );
      })}
    </div>
  );
}
