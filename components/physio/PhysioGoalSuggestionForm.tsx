'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useToast } from '@/components/feedback/Toast';
import { classifyError } from '@/lib/feedback';
import { formatLongDate } from '@/lib/dates';
import {
  useSubmitPhysioGoalSuggestion,
  usePhysioGoalSuggestions
} from '@/lib/supabase/physioGoalSuggestion';

interface PhysioGoalSuggestionFormProps {
  patientId: string;
}

/**
 * Physiotherapist goal-suggestion surface.
 *
 * The physiotherapist recommends a new treatment goal for the physician
 * to consider at the next injection visit: a suggested goal in clinical
 * language plus a rationale. Below the form, suggestions already made
 * this cycle are listed with their review status.
 */
export function PhysioGoalSuggestionForm({
  patientId
}: PhysioGoalSuggestionFormProps) {
  const toast = useToast();
  const locale = useLocale();
  const submit = useSubmitPhysioGoalSuggestion();
  const existing = usePhysioGoalSuggestions(patientId, true);

  const [goal, setGoal] = useState('');
  const [rationale, setRationale] = useState('');

  const canSubmit =
    goal.trim().length > 0 &&
    rationale.trim().length > 0 &&
    !submit.isPending;

  const doSubmit = async () => {
    if (!canSubmit) return;
    try {
      await submit.mutateAsync({
        patientId,
        suggestedGoal: goal.trim(),
        rationale: rationale.trim()
      });
      toast.success('Suggestion sent');
      setGoal('');
      setRationale('');
    } catch (err) {
      toast.error(
        classifyError(err) === 'errorGeneric'
          ? 'Could not send the suggestion. Please try again.'
          : 'Could not send the suggestion.'
      );
    }
  };

  return (
    <div>
      <section className="mt-6">
        <h2 className="font-display text-[20px] text-ink">
          Suggest a goal
        </h2>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
          Recommend a new treatment goal for the physician to consider
          at the next injection visit.
        </p>

        <div className="mt-5">
          <label
            htmlFor="physio-goal"
            className="block text-[14px] font-semibold text-ink"
          >
            Suggested goal
          </label>
          <textarea
            id="physio-goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
            maxLength={500}
            className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
            placeholder="e.g. Improve active ankle dorsiflexion to reduce foot drop during swing phase."
          />
        </div>

        <div className="mt-5">
          <label
            htmlFor="physio-rationale"
            className="block text-[14px] font-semibold text-ink"
          >
            Clinical rationale
          </label>
          <p className="mt-0.5 text-[14px] text-ink-muted">
            What you observed that led to this suggestion.
          </p>
          <textarea
            id="physio-rationale"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={4}
            maxLength={1000}
            className="mt-2 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
            placeholder="e.g. Persistent foot drop noted during gait training; patient compensating with hip hiking. Current goals don't address ankle control."
          />
        </div>

        <button
          type="button"
          onClick={doSubmit}
          disabled={!canSubmit}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-cream-soft hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submit.isPending ? 'Sending…' : 'Send suggestion'}
        </button>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-[20px] text-ink">
          Suggestions made
        </h2>
        {existing.isLoading ? (
          <p className="mt-3 text-[14px] text-ink-muted">Loading…</p>
        ) : !existing.data || existing.data.length === 0 ? (
          <p className="mt-3 text-[14px] text-ink-muted">
            No goal suggestions made yet this cycle.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {existing.data.map((s) => (
              <li
                key={s.id}
                className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-display text-[16px] leading-snug text-ink">
                    {s.suggestedGoal}
                  </p>
                  <span className="shrink-0 rounded-full border border-stone bg-cream px-2 py-0.5 text-[12px] uppercase tracking-wider text-ink-muted">
                    {s.status === 'needsReview'
                      ? 'Awaiting review'
                      : s.status}
                  </span>
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                  {s.rationale}
                </p>
                <p className="mt-2 text-[13px] text-ink-muted">
                  {formatLongDate(s.createdAt.slice(0, 10), locale)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
