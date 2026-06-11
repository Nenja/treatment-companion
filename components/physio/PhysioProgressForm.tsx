'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { GoalRatingPicker } from '@/components/wizard/GoalRatingPicker';
import { GasGoalRatingPicker } from '@/components/wizard/GasGoalRatingPicker';
import { GoalProgressView } from '@/components/clinician/GoalProgressView';
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
  /**
   * Called after a successful submission, after the form has reset for
   * the next entry. When the form is on its own page, the caller uses
   * this to navigate back; when the form is inline, it can be omitted
   * and the form simply stays put for further entries.
   */
  onSaved?: () => void;
  /**
   * Optional progress-trend data. When provided, each goal card shows its
   * trend chart (and the physician's per-goal note) above the rating
   * controls — the unified "rate beside the trend" cockpit cards. When
   * omitted (the standalone /physio/progress page), the form renders the
   * plain rating cards it always did.
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
  goals,
  onSaved,
  currentWeek,
  ratingsByGoal,
  physioRatingsByGoal,
  goalHandoffNotes
}: PhysioProgressFormProps) {
  const toast = useToast();
  const locale = useLocale();
  const t = useTranslations('physioForms');
  const tHandoff = useTranslations('clinician.goalHandoff');
  const submit = useSubmitPhysioAssessment();
  const recent = usePhysioAssessments(patientId, true);
  const hasTrend = currentWeek != null;

  const [date, setDate] = useState<string>(todayIso());
  const [note, setNote] = useState('');
  // Per-goal state. A goal is "included" in the visit if it has a rating,
  // is marked working-on, or is flagged for adjustment — any one signal.
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [gasRatings, setGasRatings] = useState<Record<string, number>>({});
  const [openGoals, setOpenGoals] = useState<Record<string, boolean>>({});
  const [workingOn, setWorkingOn] = useState<Record<string, boolean>>({});
  const [needsAdj, setNeedsAdj] = useState<Record<string, boolean>>({});
  const [adjNote, setAdjNote] = useState<Record<string, string>>({});

  const toggleGoal = (goalId: string) => {
    setOpenGoals((prev) => ({ ...prev, [goalId]: !prev[goalId] }));
    // If collapsing, drop any rating for that goal — collapsed = skipped.
    if (openGoals[goalId]) {
      setRatings((prev) => {
        const next = { ...prev };
        delete next[goalId];
        return next;
      });
      setGasRatings((prev) => {
        const next = { ...prev };
        delete next[goalId];
        return next;
      });
    }
  };

  const isRated = (id: string) =>
    typeof ratings[id] === 'number' || typeof gasRatings[id] === 'number';
  const isIncluded = (id: string) =>
    isRated(id) || !!workingOn[id] || !!needsAdj[id];
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
        workingOn: !!workingOn[g.id],
        needsAdjustment: !!needsAdj[g.id],
        adjustmentNote: needsAdj[g.id] ? adjNote[g.id]?.trim() || null : null
      }));
    try {
      await submit.mutateAsync({
        patientId,
        date,
        note: note.trim() || undefined,
        ratings: ratingInputs
      });
      toast.success(t('progressToast'));
      setRatings({});
      setGasRatings({});
      setOpenGoals({});
      setWorkingOn({});
      setNeedsAdj({});
      setAdjNote({});
      setNote('');
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
            className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[15px] text-ink focus:border-sage focus:outline-none"
          />
        </div>

        {/* Per-goal cards */}
        <div className="mt-6 space-y-3">
          {goals.map((g) => {
            const isOpen = !!openGoals[g.id];
            const rated =
              typeof ratings[g.id] === 'number' ||
              typeof gasRatings[g.id] === 'number';
            const isWorking = !!workingOn[g.id];
            const isAdj = !!needsAdj[g.id];
            return (
              <div key={g.id} className={hasTrend ? 'space-y-3' : ''}>
                {hasTrend && currentWeek != null && (
                  <>
                    <GoalProgressView
                      goalText={g.patientFacingText}
                      kind={g.kind}
                      currentWeek={currentWeek}
                      ratings={ratingsByGoal?.get(g.id) ?? []}
                      physioRatings={physioRatingsByGoal?.get(g.id) ?? []}
                      nrsDirection={g.nrsDirection}
                    />
                    {goalHandoffNotes?.get(g.id) && (
                      <div className="rounded-[var(--radius-button)] border border-sage-soft bg-sage-soft/20 px-3 py-2">
                        <p className="text-[12px] font-semibold text-sage-deep">
                          {tHandoff('fromPhysician')}
                        </p>
                        <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">
                          {goalHandoffNotes.get(g.id)}
                        </p>
                      </div>
                    )}
                  </>
                )}
                <div className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5">
                  {hasTrend ? (
                    <p className="eyebrow">{t('thisWeek')}</p>
                  ) : (
                    <p className="font-display text-[16px] leading-snug text-ink">
                      {g.patientFacingText}
                    </p>
                  )}

                {/* Signal toggles — taps, no typing. */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setWorkingOn((p) => ({ ...p, [g.id]: !p[g.id] }))
                    }
                    aria-pressed={isWorking}
                    className={`rounded-[var(--radius-button)] border px-3 py-1.5 text-[13px] font-semibold ${
                      isWorking
                        ? 'border-sage-deep bg-sage-deep text-on-accent'
                        : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
                    }`}
                  >
                    {t('workingOn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleGoal(g.id)}
                    aria-expanded={isOpen}
                    className={`rounded-[var(--radius-button)] border px-3 py-1.5 text-[13px] font-semibold ${
                      isOpen
                        ? 'border-sage bg-sage-soft text-sage-deep'
                        : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
                    }`}
                  >
                    {isOpen ? t('progressRating') : t('progressRate')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setNeedsAdj((p) => ({ ...p, [g.id]: !p[g.id] }))
                    }
                    aria-pressed={isAdj}
                    className={`rounded-[var(--radius-button)] border px-3 py-1.5 text-[13px] font-semibold ${
                      isAdj
                        ? 'border-amber-deep bg-amber-soft text-ink'
                        : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
                    }`}
                  >
                    {t('needsAdjustment')}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-5">
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
                    {!rated && (
                      <p className="mt-2 text-[13px] text-ink-muted">
                        {t('setValueHint')}
                      </p>
                    )}
                  </div>
                )}

                {isAdj && (
                  <div className="mt-3">
                    <label className="block text-[13px] font-semibold text-ink-soft">
                      {t('adjustmentNoteLabel')}
                    </label>
                    <textarea
                      value={adjNote[g.id] ?? ''}
                      onChange={(e) =>
                        setAdjNote((p) => ({ ...p, [g.id]: e.target.value }))
                      }
                      rows={2}
                      maxLength={2000}
                      placeholder={t('adjustmentNotePlaceholder')}
                      className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] leading-relaxed text-ink focus:border-sage focus:outline-none"
                    />
                  </div>
                )}

                {!isOpen && !isWorking && !isAdj && (
                  <p className="mt-2 text-[13px] text-ink-muted">
                    {t('notAssessedHint')}
                  </p>
                )}
                </div>
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
            {t('noteLabel')}{' '}
            <span className="text-ink-muted">{t('noteOptional')}</span>
          </label>
          <p className="mt-0.5 text-[14px] text-ink-muted">{t('noteHint')}</p>
          <textarea
            id="physio-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            maxLength={2000}
            className="mt-2 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
            placeholder={t('progressNotePlaceholder')}
          />
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

      {/* Recent assessments */}
      <section className="mt-12">
        <h2 className="font-display text-[20px] text-ink">
          {t('recentTitle')}
        </h2>
        {recent.isLoading ? (
          <p className="mt-3 text-[14px] text-ink-muted">{t('loading')}</p>
        ) : !recent.data || recent.data.length === 0 ? (
          <p className="mt-3 text-[14px] text-ink-muted">{t('recentEmpty')}</p>
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
                  {t('recentGoalsRated', {
                    count: a.ratings.filter(
                      (r) => r.nrsValue != null || r.gasValue != null
                    ).length
                  })}
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
