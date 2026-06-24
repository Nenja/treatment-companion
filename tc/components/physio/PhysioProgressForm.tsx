'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CompactGoalRating } from '@/components/physio/CompactGoalRating';
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
  /** Optional action shown beside the visit-date field (e.g. Suggest a goal). */
  dateAside?: ReactNode;
  /** Optional panel rendered beneath the date row (e.g. the suggest-goal form). */
  afterDate?: ReactNode;
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
 * Goals are a collapsed list: the therapist opens the ones they actually
 * assessed this visit and rates them, leaving the rest closed. Opening a
 * goal is the deliberate "I worked on this" act — un-opened, un-rated goals
 * simply weren't reported. Each row shows a "✓ value" chip once rated so
 * progress is visible at a glance without expanding. Per goal they can also
 * suggest a treatment change for the physician (who decides the dose).
 *
 * Free-text notes to the clinic live in their own channel
 * (NoteToClinicCard), not here; this surface is the structured visit.
 */
export function PhysioProgressForm({
  patientId,
  goals,
  onSaved,
  dateAside,
  afterDate,
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
  // Which goals are expanded. All collapsed by default — the therapist opens
  // the goals they assessed.
  const [openGoals, setOpenGoals] = useState<Record<string, boolean>>({});

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
      setOpenGoals({});
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

        {/* Visit date, with an optional adjacent action (e.g. Suggest a
            goal) and an optional panel rendered beneath. */}
        <div className="mt-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex-1">
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
            {dateAside}
          </div>
          {afterDate && <div className="mt-3">{afterDate}</div>}
        </div>

        {/* Goals as a collapsed list — open the ones you assessed. */}
        <div className="mt-6 space-y-2.5">
          {goals.map((g) => {
            const isGas = g.kind === 'gas';
            const flagged = !!suggestChange[g.id];
            // "Rated" for display = a pending local pick OR the latest saved
            // therapist rating for this goal. (Submit inclusion still uses the
            // local-only isRated, so a previously-saved goal is never silently
            // re-submitted.)
            const localRated = isRated(g.id);
            const physioPts = physioRatingsByGoal?.get(g.id);
            const lastPhysio =
              physioPts && physioPts.length
                ? physioPts[physioPts.length - 1]
                : null;
            const rated = localRated || !!lastPhysio;
            const open = !!openGoals[g.id];
            const localLabel = isGas
              ? typeof gasRatings[g.id] === 'number'
                ? gasRatings[g.id] > 0
                  ? `+${gasRatings[g.id]}`
                  : `${gasRatings[g.id]}`
                : null
              : typeof ratings[g.id] === 'number'
                ? `${ratings[g.id]}`
                : null;
            const persistedLabel = lastPhysio
              ? isGas
                ? lastPhysio.value > 0
                  ? `+${lastPhysio.value}`
                  : `${lastPhysio.value}`
                : `${lastPhysio.nrs}`
              : null;
            const ratedLabel = localLabel ?? persistedLabel;

            return (
              <div
                key={g.id}
                className={`overflow-hidden rounded-[var(--radius-card)] border bg-cream-soft ${
                  rated
                    ? 'border-stone border-l-[3px] border-l-sage-deep'
                    : flagged
                      ? 'border-stone border-l-[3px] border-l-amber-deep'
                      : 'border-stone'
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenGoals((p) => ({ ...p, [g.id]: !p[g.id] }))
                  }
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-cream"
                >
                  <span className="min-w-0 flex-1 font-display text-[16px] leading-snug text-ink">
                    {g.patientFacingText}
                  </span>
                  {rated ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sage-deep px-2.5 py-0.5 text-[12px] font-semibold text-on-accent">
                      ✓ {ratedLabel}
                    </span>
                  ) : flagged ? (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-amber-deep px-2.5 py-0.5 text-[12px] font-semibold text-on-accent">
                      {t('flaggedShort')}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[12px] text-ink-muted">
                      {t('rateShort')}
                    </span>
                  )}
                  <span
                    aria-hidden
                    className={`shrink-0 text-ink-muted transition-transform ${
                      open ? 'rotate-180' : ''
                    }`}
                  >
                    ▾
                  </span>
                </button>

                {open && (
                  <div className="border-t border-stone px-4 pb-4 pt-3">
                    {hasTrend && currentWeek != null && (
                      <>
                        <GoalProgressView
                          bare
                          hideTitle
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
                        <div className="mt-4 flex items-baseline justify-between gap-2">
                          <p className="eyebrow">{t('ratingHeading')}</p>
                          <span className="text-[12px] text-ink-muted">
                            {t('ratingOptional')}
                          </span>
                        </div>
                      </>
                    )}

                    <div className={hasTrend ? 'mt-3' : ''}>
                      {isGas ? (
                        <CompactGoalRating
                          ariaLabel={`GAS rating for ${g.patientFacingText}`}
                          kind="gas"
                          anchors={g.gas}
                          value={gasRatings[g.id]}
                          onChange={(v) =>
                            setGasRatings((prev) => ({ ...prev, [g.id]: v }))
                          }
                        />
                      ) : (
                        <CompactGoalRating
                          ariaLabel={`NRS rating for ${g.patientFacingText}`}
                          kind="nrs"
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
                  </div>
                )}
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
