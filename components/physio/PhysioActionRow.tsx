'use client';

/**
 * Horizontal action row for the therapist patient page.
 *
 * Four secondary entry points, always visible:
 *   - treated muscles (read-only reference)
 *   - suggest goal    (opens an inline form)
 *   - suggest muscle  (opens an inline form)
 *   - history         (inline timeline of past assessments)
 *
 * Mirrors the clinician's PatientActionRow in shape and behaviour:
 * a presentational component that reports taps via onSelect, with
 * panel state lifted to the page. The primary action (report progress)
 * lives separately as a prominent button — NOT in the row — because
 * the row is for things done occasionally, while progress reporting
 * is the routine task at every session.
 */

export type PhysioActionId =
  | 'muscles'
  | 'suggestGoal'
  | 'suggestMuscle'
  | 'history';

function iconFor(id: PhysioActionId) {
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
    case 'muscles':
      // Simple anatomical stand-in — a body silhouette outline.
      return (
        <svg {...common}>
          <circle cx="12" cy="5" r="2.5" />
          <path d="M7 10c0-1.5 2-2 5-2s5 0.5 5 2v4l-2 1v6h-2v-5h-2v5h-2v-6l-2-1z" />
        </svg>
      );
    case 'suggestGoal':
      // A plus inside a target / aim circle — "suggest a new goal".
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
    case 'suggestMuscle':
      // A muscle/fibre stand-in: marker / pin shape, suggests flagging.
      return (
        <svg {...common}>
          <path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
      );
    case 'history':
      // Clock with a small arrow back — assessment history over time.
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
  }
}

export function PhysioActionRow({
  openPanel,
  onSelect,
  labels,
  shortLabels
}: {
  /** Which inline panel is open, if any. */
  openPanel: PhysioActionId | null;
  onSelect: (id: PhysioActionId) => void;
  /** Full labels — used for screen-reader names. */
  labels: Record<PhysioActionId, string>;
  /** Short visible labels under each icon. Optional with fallback so a
   *  brief page/component upload mismatch can't break the build. */
  shortLabels?: Record<PhysioActionId, string>;
}) {
  const items: PhysioActionId[] = [
    'muscles',
    'suggestGoal',
    'suggestMuscle',
    'history'
  ];

  return (
    <div className="mt-5 flex gap-2" role="group" aria-label="Therapist actions">
      {items.map((id) => {
        const isActive = openPanel === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-label={labels[id]}
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
          </button>
        );
      })}
    </div>
  );
}
