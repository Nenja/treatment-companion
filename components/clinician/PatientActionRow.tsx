'use client';

/**
 * Horizontal action row for the clinician patient page.
 *
 * Four entry points, always visible under the patient name:
 *   - patient suggestions  (count badge — opens an inline panel)
 *   - therapist input      (count badge — opens an inline panel)
 *   - history              (no count — navigates to the history page)
 *   - export               (no count — opens the export modal)
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

export type PatientActionId = 'suggestions' | 'physio' | 'history' | 'export';

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
    case 'suggestions':
      // speech bubble
      return (
        <svg {...common}>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
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
  }
}

export function PatientActionRow({
  suggestionCount,
  physioCount,
  openPanel,
  onSelect,
  labels
}: {
  suggestionCount: number;
  physioCount: number;
  /** Which inline panel is currently open, if any. */
  openPanel: 'suggestions' | 'physio' | null;
  onSelect: (id: PatientActionId) => void;
  labels: Record<PatientActionId, string>;
}) {
  const items: { id: PatientActionId; count?: number }[] = [
    { id: 'suggestions', count: suggestionCount },
    { id: 'physio', count: physioCount },
    { id: 'history' },
    { id: 'export' }
  ];

  return (
    <div className="mt-5 flex gap-2" role="group" aria-label="Patient actions">
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
            className={`relative flex h-[50px] flex-1 items-center justify-center rounded-[var(--radius-button)] border transition-colors ${
              isActive
                ? 'border-sage-deep bg-sage-deep text-on-accent'
                : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
            }`}
          >
            {iconFor(id)}
            {typeof count === 'number' && <Badge count={count} />}
          </button>
        );
      })}
    </div>
  );
}
