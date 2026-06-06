'use client';

import { GoalProgressView } from './GoalProgressView';
import { useModalA11y } from '@/lib/useModalA11y';

/**
 * Shows one goal's progress graph enlarged in a modal. The graph SVG is
 * viewBox-based and scales to its container, so rendering the same
 * GoalProgressView in a wide modal simply makes it bigger and easier to
 * read — no separate large-chart implementation needed.
 *
 * Bottom sheet on mobile, centred panel on larger screens (matching the
 * app's other modals). Closes on backdrop tap, the close button, or Esc
 * (via useModalA11y).
 */
export function GoalGraphModal({
  goalText,
  kind,
  currentWeek,
  ratings,
  physioRatings,
  nrsDirection,
  closeLabel,
  onClose
}: {
  goalText: string;
  kind?: 'nrs' | 'gas';
  currentWeek: number;
  // Loosely typed to avoid duplicating GoalProgressView's row shapes;
  // the page passes exactly what GoalProgressView expects.
  ratings: React.ComponentProps<typeof GoalProgressView>['ratings'];
  physioRatings: React.ComponentProps<typeof GoalProgressView>['physioRatings'];
  nrsDirection?: 'higherIsBetter' | 'lowerIsBetter';
  closeLabel: string;
  onClose: () => void;
}) {
  const containerRef = useModalA11y(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={goalText}
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-[var(--radius-card)] bg-cream p-4 shadow-xl sm:p-6"
      >
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink"
          >
            {closeLabel}
          </button>
        </div>
        <GoalProgressView
          goalText={goalText}
          kind={kind}
          currentWeek={currentWeek}
          ratings={ratings}
          physioRatings={physioRatings}
          nrsDirection={nrsDirection}
        />
      </div>
    </div>
  );
}
