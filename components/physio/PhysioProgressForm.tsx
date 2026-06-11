'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { GoalRatingPicker } from '@/components/wizard/GoalRatingPicker';
import { GasGoalRatingPicker } from '@/components/wizard/GasGoalRatingPicker';
import { GoalProgressView } from '@/components/clinician/GoalProgressView';
import { useToast } from '@/components/feedback/Toast';
import { classifyError } from '@/lib/feedback';
import { todayIso } from '@/lib/dates';
import {
  useSubmitPhysioAssessment,
  type PhysioGoalRatingInput
} from '@/lib/supabase/physioAssessment';
import type { PhysioPatientData } from '@/lib/supabase/physioPatient';

interface PhysioProgressFormProps {
  patientId: string;
  goals: PhysioPatientData['goals'];
  onSaved?: () => void;
  /**
   * Optional progress-trend data. When provided, each goal renders as a
   * card with its trend chart above the rating. When omitted (the
   * standalone /physio/progress page), each goal is a plain rating card.
   */
  currentWeek?: number;
  ratingsByGoal?: Map<
    string,
    {
      weekNumber: number;
      value: -2 | -1 | 0 | 1 | 2 | null;
      nrs: number | null;
      reported: boolean;
      comment?: string;
      submitterLabel?: 'self' | 'caregiver';
    }[]
  >;
  physioRatingsByGoal?: Map<
    string,
    {
      weekNumber: number;
      nrs: number;
      value: -2 | -1 | 0 | 1 | 2;
      note: string | null;
    }[]
  >;
  goalHandoffNotes?: Map<string, string>;
}

/**
 * Physiotherapist visit-rating surface.
 *
 * One assessment = one visit. The therapist picks a date and rates the
 * goals they assessed today on the same scale the patient uses. Rating a
 * goal IS the report that they engaged with it (no separate "working on"
 * step); a goal left un-rated simply wasn't reported this visit. Per goal
 * they can also suggest a treatment change — a constructive note to the
 * physician, who decides the dose.
 *
 * Free-text notes to the clinic live in their own channel
 * (NoteToClinicCard), not here; this surface is the structured visit.
 */
export function PhysioProgressForm({
  patientId,
  goals,
  onSaved,
  currentWeek,
  ratingsByGoal,
  physioRatingsByGoal,
  goalHandoffNotes
}: PhysioProgressFormProps) {
  const toast = useToast();
  const t = useTranslations('physioForms');
  const tHandoff = useTranslations('clinician.goalHandoff');
  const submit = useSubmitPhysioAssessment();
  const hasTrend = currentWeek != null;

  const [date, setDate] = useState<string>(todayIso());
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [gasRatings, setGasRatings] = useState<Record<string, number>>({});
  const [suggestChange, setSuggestChange] = useState<Record<string, boolean>>(
    {}
  );
  const [changeNote, setChangeNote] = useState<Record<string, string>>({});

  const isRated = (id: string) =>
    typeof ratings[id] === 'number' || typeof gasRatings[id] === 'number';
  const isIncluded = (id: string) => isRated(id) || !!suggestChange[id];
  const includedCount = goals.filter((g) => isIncluded(g.id)).length;
  const canSubmit = includedCount > 0 && !!date && !submit.isPending;

  const doSubmit = async () => {
    if (!canSubmit) return;
    const ratingInputs: PhysioGoalRatingInput[] = goals
      .filter((g) => isIncluded(g.id))
      .map((g) => ({
        approvedGoalId: g.id,
        nrsValue:
          g.kind === 'gas'
            ? null
            : typeof ratings[g.id] === 'number'
              ? ratings[g.id]
              : null,
        gasValue:
          g.kind === 'gas' && typeof gasRatings[g.id] === 'number'
            ? gasRatings[g.id]
            : null,
        needsAdjustment: !!suggestChange[g.id],
        adjustmentNote: suggestChange[g.id]
          ? changeNote[g.id]?.trim() || null
          : null
      }));
    try {
      await submit.mutateAsync({ patientId, date, ratings: ratingInputs });
      toast.success(t('progressToast'));
      setRatings({});
      setGasRatings({});
      setSuggestChange({});
      setChangeNote({});
      setDate(todayIso());
      onSaved?.();
    } catch (err) {
      toast.error(
        classifyError(err) === 'errorGeneric'
          ? t('progressError')
          : t('progressErrorShort')
      );
    }
  };

  return (
    <div>
      <section className="mt-6">
        <h2 className="font-display text-[20px] text-ink">
          {t('sectionTitle')}
        </h2>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
          {t('sectionHint')}
        </p>

        {/* Visit date */}
        <div className="mt-5">
          <label
            htmlFor="physio-date"
            className="block text-[14px] font-semibold text-ink"
          >
            {t('dateLabel')}
          </label>
          <input
            id="physio-date"
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[15px] text-ink focus:border-sage focus:outline-none lg:max-w-xs"
          />
        </div>

        <div className="mt-6 space-y-3">
          {goals.map((g) => {
            const flagged = !!suggestChange[g.id];

            // Rating control + treatment-change suggestion. Shared between
            // the trend card and the plain card.
            const ratingBody = (
              <>
                <div className="mt-4">
                  {g.kind === 'gas' ? (
                    <GasGoalRatingPicker
                      ariaLabel={`GAS rating for ${g.patientFacingText}`}
                      goalText=""
                      anchors={g.gas}
                      value={gasRatings[g.id]}
                      onChange={(v) =>
                        setGasRatings((prev) => ({ ...prev, [g.id]: v }))
                      }
                    />
                  ) : (
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
                  )}
                </div>

                <div className="mt-4 border-t border-stone pt-3">
                  <button
                    type="button"
                    onClick={() =>
                      setSuggestChange((p) => ({ ...p, [g.id]: !p[g.id] }))
                    }
                    aria-pressed={flagged}
                    className={`inline-flex items-center gap-2 text-[13px] font-semibold ${
                      flagged
                        ? 'text-amber-deep'
                        : 'text-ink-soft hover:text-ink'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-[4px] border-[1.5px] border-amber-deep ${
                        flagged ? 'bg-amber-deep' : ''
                      }`}
                      aria-hidden
                    />
                    {t('needsAdjustment')}
                  </button>
                  {flagged && (
                    <div className="mt-2.5">
                      <label className="block text-[13px] font-semibold text-ink-soft">
                        {t('adjustmentNoteLabel')}
                      </label>
                      <textarea
                        value={changeNote[g.id] ?? ''}
                        onChange={(e) =>
                          setChangeNote((p) => ({
                            ...p,
                            [g.id]: e.target.value
                          }))
                        }
                        rows={2}
                        maxLength={2000}
                        placeholder={t('adjustmentNotePlaceholder')}
                        className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] leading-relaxed text-ink focus:border-sage focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </>
            );

            // With trend: a stacked card — chart on top, rating below.
            if (hasTrend && currentWeek != null) {
              return (
                <div
                  key={g.id}
                  className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5"
                >
                  <GoalProgressView
                    bare
                    goalText={g.patientFacingText}
                    kind={g.kind}
                    currentWeek={currentWeek}
                    ratings={ratingsByGoal?.get(g.id) ?? []}
                    physioRatings={physioRatingsByGoal?.get(g.id) ?? []}
                    nrsDirection={g.nrsDirection}
                  />
                  {goalHandoffNotes?.get(g.id) && (
                    <div className="mt-3 rounded-[var(--radius-button)] border border-sage-soft bg-sage-soft/20 px-3 py-2">
                      <p className="text-[12px] font-semibold text-sage-deep">
                        {tHandoff('fromPhysician')}
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">
                        {goalHandoffNotes.get(g.id)}
                      </p>
                    </div>
                  )}
                  <div className="mt-4 border-t border-stone pt-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="eyebrow">{t('ratingHeading')}</p>
                      <span className="text-[12px] text-ink-muted">
                        {t('ratingOptional')}
                      </span>
                    </div>
                    {ratingBody}
                  </div>
                </div>
              );
            }

            // Standalone /physio/progress (no trend): plain single card.
            return (
              <div
                key={g.id}
                className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5"
              >
                <p className="font-display text-[16px] leading-snug text-ink">
                  {g.patientFacingText}
                </p>
                {ratingBody}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={doSubmit}
          disabled={!canSubmit}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submit.isPending
            ? t('progressSaving')
            : includedCount > 0
              ? t('saveAssessment', { count: includedCount })
              : t('progressRateAtLeastOne')}
        </button>
      </section>
    </div>
  );
}
