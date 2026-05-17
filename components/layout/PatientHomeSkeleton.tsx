'use client';

/**
 * Skeleton placeholders for the patient home page, shown while
 * data is loading from Supabase. Shapes roughly match the rendered
 * layout so there's no jump when real content arrives.
 *
 * Uses the same Tailwind classes as the rendered components so visual
 * width/spacing stays consistent.
 */
export function PatientHomeSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="animate-pulse space-y-6"
    >
      {/* Cycle context line */}
      <div className="space-y-2">
        <div className="h-3 w-32 rounded bg-stone" />
        <div className="h-8 w-48 rounded bg-stone" />
      </div>

      {/* Check-in card */}
      <div className="rounded-[var(--radius-card)] border border-stone bg-stone-soft p-6">
        <div className="h-6 w-3/4 rounded bg-stone" />
        <div className="mt-2 h-4 w-1/2 rounded bg-stone/70" />
        <div className="mt-5 h-12 w-full rounded-[var(--radius-button)] bg-stone" />
      </div>

      {/* Cycle progress dots */}
      <div className="flex gap-1.5 pt-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-3 w-3 rounded-full bg-stone" />
        ))}
      </div>

      {/* Goal cards */}
      <div className="space-y-3 pt-4">
        <div className="h-4 w-24 rounded bg-stone" />
        {[1, 2].map((i) => (
          <div
            key={i}
            className="rounded-[var(--radius-card)] border border-stone bg-stone-soft p-4"
          >
            <div className="h-5 w-4/5 rounded bg-stone" />
            <div className="mt-2 h-4 w-3/5 rounded bg-stone/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
