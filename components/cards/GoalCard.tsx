import type { ApprovedGoal } from '@/lib/types';

interface GoalCardProps {
  goal: ApprovedGoal;
}

export function GoalCard({ goal }: GoalCardProps) {
  return (
    <article className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5">
      <h3 className="font-display text-[20px] leading-snug text-ink">
        {goal.patientFacingText}
      </h3>
    </article>
  );
}
