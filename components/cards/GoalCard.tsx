import type { ApprovedGoal } from '@/lib/types';

interface GoalCardProps {
  goal: ApprovedGoal;
}

/**
 * Patient view of an approved goal on the home screen.
 *
 * Minimal on purpose. The review date and cycle progress live once at
 * the top of the home screen (where they belong as orientation), not
 * repeated on every card. The five-step scale and its anchors live
 * inside the weekly check-in flow (slice 3), where the patient is
 * actually rating progress — that is the moment the scale does work.
 *
 * SMART text is never shown to patients.
 */
export function GoalCard({ goal }: GoalCardProps) {
  return (
    <article className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5">
      <h3 className="font-display text-[20px] leading-snug text-ink">
        {goal.patientFacingText}
      </h3>
    </article>
  );
}
