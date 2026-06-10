import { ReadAloudButton } from '@/components/feedback/ReadAloudButton';

interface GoalCardProps {
  patientFacingText: string;
  /** When provided, a small graph button appears on the right that calls
   *  this — the home page opens the goal's read-only progress graph in a
   *  pop-up. Omitted → no button (text only, as before). */
  onViewGraph?: () => void;
  /** Accessible label / tooltip for the graph button. */
  viewGraphLabel?: string;
}

/**
 * Patient view of an approved goal on the home screen.
 *
 * Minimal on purpose. The review date and cycle progress live once at
 * the top of the home screen (where they belong as orientation), not
 * repeated on every card. The five-step scale and its anchors live
 * inside the weekly check-in flow, where the patient is actually
 * rating progress — that is the moment the scale does work.
 *
 * The optional graph button is the one piece of detail offered here: it
 * sits quietly to the right of the goal text, so a patient who wants to
 * see how this goal has moved can open a read-only graph, but it never
 * competes with the goal itself.
 *
 * SMART text is never shown to patients.
 */
export function GoalCard({
  patientFacingText,
  onViewGraph,
  viewGraphLabel
}: GoalCardProps) {
  return (
    <article className="flex items-center justify-between gap-3 py-4">
      <h3 className="min-w-0 flex-1 font-display text-[18px] leading-snug text-ink">
        {patientFacingText}
      </h3>
      <div className="flex shrink-0 items-center gap-1.5">
        <ReadAloudButton text={patientFacingText} />
        {onViewGraph && (
          <button
            type="button"
            onClick={onViewGraph}
            aria-label={viewGraphLabel}
            title={viewGraphLabel}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] border border-sage/40 bg-cream px-3 text-[13px] font-semibold text-sage-deep hover:bg-sage-soft"
          >
            {/* line-chart glyph */}
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 3v18h18" />
              <path d="M7 13l3-3 3 2 4-5" />
            </svg>
            {viewGraphLabel && <span className="hidden sm:inline">{viewGraphLabel}</span>}
          </button>
        )}
      </div>
    </article>
  );
}
