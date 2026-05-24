'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { GoalRatingPicker } from '@/components/wizard/GoalRatingPicker';
import { useToast } from '@/components/feedback/Toast';
import { classifyError } from '@/lib/feedback';
import { todayIso, formatLongDate } from '@/lib/dates';
import {
  useSubmitPhysioAssessment,
  usePhysioAssessments,
  type PhysioGoalRatingInput
} from '@/lib/supabase/physioAssessment';
import type { PhysioPatientData } from '@/lib/supabase/physioPatient';

interface PhysioProgressFormProps {
  patientId: string;
  goals: PhysioPatientData['goals'];
}

/**
 * Physiotherapist progress-reporting surface.
 *
 * The physiotherapist records one assessment = one visit. They pick a
 * date, optionally write one visit-level clinical note, and rate
 * whichever goals are relevant on the same 0-10 NRS scale the patient
 * uses. Goals they don't assess are simply left un-rated (skip = the
 * goal's card stays collapsed; no rating is sent for it).
 *
 * Below the form, recent assessments for this patient are listed so
 * the physiotherapist can see what's already been logged this cycle.
 */
export function PhysioProgressForm({
  patientId,
  goals
}: PhysioProgressFormProps) {
  const toast = useToast();
  const locale = useLocale();
  const submit = useSubmitPhysioAssessment();
  const recent = usePhysioAssessments(patientId, true);

  const [date, setDate] = useState<string>(todayIso());
  const [note, setNote] = useState('');
  // Per-goal rating state. A goal is "included" once the physio opens
  // its picker; the value is the NRS number. Goals not in this map are
  // skipped.
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [openGoals, setOpenGoals] = useState<Record<string, boolean>>({});

  const toggleGoal = (goalId: string) => {
    setOpenGoals((prev) => {
      const next = { ...prev, [goalId]: !prev[goalId] };
      return next;
    });
    // If collapsing, drop any rating for that goal — collapsed = skipped.
    setRatings((prev) => {
      if (openGoals[goalId]) {
        const next = { ...prev };
        delete next[goalId];
        return next;
      }
      return prev;
    });
  };

  const ratedCount = Object.keys(ratings).length;
  const canSubmit = ratedCount > 0 && !!date && !submit.isPending;

  const doSubmit = async () => {
    if (!canSubmit) return;
    const ratingInputs: PhysioGoalRatingInput[] = Object.entries(
      ratings
    ).map(([approvedGoalId, nrsValue]) => ({
      approvedGoalId,
      nrsValue
    }));
    try {
      await submit.mutateAsync({
        patientId,
        date,
        note: note.trim() || undefined,
        ratings: ratingInputs
      });
      toast.success('Assessment saved');
      // Reset for the next assessment.
      setRatings({});
      setOpenGoals({});
      setNote('');
      setDate(todayIso());
    } catch (err) {
      toast.error(
        classifyError(err) === 'errorGeneric'
          ? 'Could not save the assessment. Please try again.'
          : 'Could not save the assessment.'
      );
    }
  };

  return (
    <div>
      <section className="mt-6">
        <h2 className="font-display text-[20px] text-ink">
          Record an assessment
        </h2>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
          Rate the goals you assessed today. Leave a goal closed to skip
          it.
        </p>

        {/* Visit date */}
        <div className="mt-5">
          <label
            htmlFor="physio-date"
            className="block text-[14px] font-semibold text-ink"
          >
            Date of visit
          </label>
          <input
            id="physio-date"
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[15px] text-ink focus:border-sage focus:outline-none"
          />
        </div>

        {/* Per-goal rating cards */}
        <div className="mt-6 space-y-3">
          {goals.map((g) => {
            const isOpen = !!openGoals[g.id];
            const rated = typeof ratings[g.id] === 'number';
            return (
              <div
                key={g.id}
                className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-display text-[16px] leading-snug text-ink">
                    {g.patientFacingText}
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleGoal(g.id)}
                    aria-expanded={isOpen}
                    className={`shrink-0 rounded-[var(--radius-button)] border px-3 py-1.5 text-[14px] font-semibold ${
                      isOpen
                        ? 'border-sage bg-sage-soft text-sage-deep'
                        : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
                    }`}
                  >
                    {isOpen ? 'Rating' : 'Rate'}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-5">
                    <GoalRatingPicker
                      ariaLabel={`NRS rating for ${g.patientFacingText}`}
                      goalText=""
                      question={g.nrsQuestion}
                      direction={g.nrsDirection}
                      value={ratings[g.id]}
                      onChange={(v) =>
                        setRatings((prev) => ({ ...prev, [g.id]: v }))
                      }
                    />
                  </div>
                )}

                {!isOpen && (
                  <p className="mt-2 text-[13px] text-ink-muted">
                    Not assessed — tap Rate to include this goal.
                  </p>
                )}
                {isOpen && !rated && (
                  <p className="mt-2 text-[13px] text-ink-muted">
                    Move the slider or use the buttons to set a value.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Visit-level note */}
        <div className="mt-6">
          <label
            htmlFor="physio-note"
            className="block text-[14px] font-semibold text-ink"
          >
            Clinical note <span className="text-ink-muted">(optional)</span>
          </label>
          <p className="mt-0.5 text-[14px] text-ink-muted">
            One note for the visit overall — observations, exercise
            adjustments, anything the physician should see.
          </p>
          <textarea
            id="physio-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            maxLength={2000}
            className="mt-2 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
            placeholder="e.g. Improved wrist extension during gait training; increased resistance band load."
          />
        </div>

        <button
          type="button"
          onClick={doSubmit}
          disabled={!canSubmit}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submit.isPending
            ? 'Saving…'
            : ratedCount > 0
              ? `Save assessment (${ratedCount} goal${ratedCount === 1 ? '' : 's'})`
              : 'Rate at least one goal'}
        </button>
      </section>

      {/* Recent assessments */}
      <section className="mt-12">
        <h2 className="font-display text-[20px] text-ink">
          Recent assessments
        </h2>
        {recent.isLoading ? (
          <p className="mt-3 text-[14px] text-ink-muted">Loading…</p>
        ) : !recent.data || recent.data.length === 0 ? (
          <p className="mt-3 text-[14px] text-ink-muted">
            No assessments recorded yet this cycle.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {recent.data.map((a) => (
              <li
                key={a.id}
                className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
              >
                <p className="text-[14px] font-semibold text-ink">
                  {formatLongDate(a.assessmentDate, locale)}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-muted">
                  {a.ratings.length} goal
                  {a.ratings.length === 1 ? '' : 's'} rated
                </p>
                {a.note && (
                  <p className="mt-2 rounded-[var(--radius-button)] border border-stone bg-cream px-2.5 py-1.5 text-[14px] leading-relaxed text-ink">
                    {a.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
