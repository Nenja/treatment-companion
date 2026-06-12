'use client';

import { useTranslations } from 'next-intl';
import { formatLongDate } from '@/lib/dates';
import { injectionSideLabel } from '@/lib/types';
import { useToast } from '@/components/feedback/Toast';
import { useSetPhysioGoalSuggestionStatus } from '@/lib/supabase/physioGoalSuggestion';
import { useSetPhysioMuscleSuggestionStatus } from '@/lib/supabase/physioMuscleSuggestion';
import type {
  ClinicianPatientGoal,
  ClinicianPhysioAssessment,
  ClinicianPhysioGoalSuggestion,
  ClinicianPhysioMuscleSuggestion
} from '@/lib/supabase/clinicianPatient';

const DAY_SHORT_KEYS = [
  'monShort',
  'tueShort',
  'wedShort',
  'thuShort',
  'friShort',
  'satShort',
  'sunShort'
] as const;

/**
 * Therapist input for the patient under review — the physiotherapist's
 * activity signals (visit days, adjustment requests) plus their goal and
 * muscle suggestions, each with the physician's consider/dismiss actions.
 *
 * Relocated from the clinician cockpit to the treatment page (where the
 * muscle suggestions are directly relevant to what's being injected). The
 * suggestion count is shown on the launching button; this renders the body.
 *
 * Pure presentation over data already loaded by useClinicianPatientData;
 * the consider/dismiss actions invalidate their own queries.
 */
export function TherapistInputPanel({
  physioAssessments,
  activeGoals,
  physioGoalSuggestions,
  physioMuscleSuggestions,
  locale
}: {
  physioAssessments: ClinicianPhysioAssessment[];
  activeGoals: ClinicianPatientGoal[];
  physioGoalSuggestions: ClinicianPhysioGoalSuggestion[];
  physioMuscleSuggestions: ClinicianPhysioMuscleSuggestion[];
  locale: string;
}) {
  const t = useTranslations('clinician.patient');
  const tTraining = useTranslations('training');

  // Distinct dated assessments are the therapist visits.
  const therapyVisitDates = Array.from(
    new Set(physioAssessments.map((a) => a.assessmentDate))
  ).sort();
  const therapyVisitCount = therapyVisitDates.length;
  const therapyWeekdaysIso = new Set(
    therapyVisitDates.map((d) => {
      const day = new Date(d + 'T00:00:00').getDay(); // 0=Sun..6=Sat
      return day === 0 ? 7 : day;
    })
  );
  // Adjustment requests, newest first.
  const adjustmentRequests = physioAssessments
    .flatMap((a) =>
      a.ratings
        .filter((r) => r.needsAdjustment)
        .map((r) => ({
          goalId: r.approvedGoalId,
          note: r.adjustmentNote,
          date: a.assessmentDate
        }))
    )
    .reverse();
  const hasTherapistActivity =
    therapyVisitCount > 0 || adjustmentRequests.length > 0;

  return (
    <div>
      <h2 className="font-display text-[18px] leading-tight text-ink">
        {t('physioInputHeading')}
      </h2>
      <p className="mt-0.5 text-[12px] text-ink-muted">
        {t('physioInputSubtitle')}
      </p>
      <div className="mt-2.5">
        {hasTherapistActivity && (
          <div className="mb-4 space-y-3">
            {therapyVisitCount > 0 && (
              <div className="rounded-[var(--radius-button)] border border-stone/70 bg-cream p-2.5">
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                  {t('physioVisitsHeading')}
                </h3>
                <p className="mt-1 text-[14px] text-ink">
                  {t('physioVisitsCount', { count: therapyVisitCount })}
                </p>
                <div
                  className="mt-2 flex gap-1"
                  aria-label={t('physioWeekdaysAria')}
                >
                  {DAY_SHORT_KEYS.map((key, i) => {
                    const iso = i + 1;
                    const on = therapyWeekdaysIso.has(iso);
                    return (
                      <span
                        key={key}
                        className={`flex h-7 w-9 items-center justify-center rounded-md text-[12px] font-semibold ${
                          on
                            ? 'bg-sage-deep text-on-accent'
                            : 'bg-stone-soft text-ink-muted'
                        }`}
                      >
                        {tTraining(key)}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {adjustmentRequests.length > 0 && (
              <div>
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                  {t('physioAdjustmentsHeading')}
                </h3>
                <ul className="mt-2 space-y-2">
                  {adjustmentRequests.map((req, idx) => {
                    const g = activeGoals.find((x) => x.id === req.goalId);
                    return (
                      <li
                        key={`${req.goalId}-${idx}`}
                        className="rounded-[var(--radius-button)] border border-amber-deep/40 bg-amber-soft p-2.5"
                      >
                        <p className="text-[14px] font-semibold leading-snug text-ink">
                          {g ? g.patientFacingText : t('physioAdjustmentGoalGone')}
                        </p>
                        {req.note && (
                          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                            {req.note}
                          </p>
                        )}
                        <p className="mt-1 text-[12px] text-ink-muted">
                          {formatLongDate(req.date, locale)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
        {physioGoalSuggestions.length === 0 &&
        physioMuscleSuggestions.length === 0 ? (
          hasTherapistActivity ? null : (
            <p className="text-[13px] text-ink-muted">{t('physioInputNone')}</p>
          )
        ) : (
          <>
            <div>
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                {t('physioSuggestedGoals')}
              </h3>
              {physioGoalSuggestions.length === 0 ? (
                <p className="mt-1.5 text-[13px] text-ink-muted">
                  {t('physioGoalsEmpty')}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {physioGoalSuggestions.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-[var(--radius-button)] border border-stone/70 bg-cream p-2.5"
                    >
                      <p className="text-[14px] font-semibold leading-snug text-ink">
                        {s.suggestedGoal}
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                        <span className="text-ink-muted">
                          {t('rationaleLabel')}:{' '}
                        </span>
                        {s.rationale}
                      </p>
                      <PhysioGoalSuggestionActions
                        suggestionId={s.id}
                        status={s.status}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                {t('physioFlaggedMuscles')}
              </h3>
              {physioMuscleSuggestions.length === 0 ? (
                <p className="mt-1.5 text-[13px] text-ink-muted">
                  {t('physioMusclesEmpty')}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {physioMuscleSuggestions.map((s) => {
                    const linkedGoal = activeGoals.find(
                      (g) => g.id === s.relatedGoalId
                    );
                    const sideLabel = injectionSideLabel(s.side);
                    return (
                      <li
                        key={s.id}
                        className="rounded-[var(--radius-button)] border border-stone/70 bg-cream p-2.5"
                      >
                        <p className="text-[14px] font-semibold leading-snug text-ink">
                          {s.muscle}{' '}
                          <span className="text-ink-muted">· {sideLabel}</span>
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                          <span className="text-ink-muted">
                            {t('rationaleLabel')}:{' '}
                          </span>
                          {s.rationale}
                        </p>
                        {linkedGoal && (
                          <p className="mt-1 text-[12px] text-ink-muted">
                            {t('relatedGoalLabel')}:{' '}
                            {linkedGoal.patientFacingText}
                          </p>
                        )}
                        <PhysioMuscleSuggestionActions
                          suggestionId={s.id}
                          status={s.status}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PhysioGoalSuggestionActions({
  suggestionId,
  status
}: {
  suggestionId: string;
  status: string;
}) {
  const setStatus = useSetPhysioGoalSuggestionStatus();
  const toast = useToast();
  const t = useTranslations('clinician.patient');

  if (status !== 'needsReview') {
    return (
      <p className="mt-3 text-[13px] uppercase tracking-wider text-ink-muted">
        {status === 'accepted'
          ? t('suggestionStatusConsidered')
          : t('suggestionStatusDismissed')}
      </p>
    );
  }

  const act = async (next: 'accepted' | 'dismissed') => {
    try {
      await setStatus.mutateAsync({ suggestionId, status: next });
      toast.success(
        next === 'accepted'
          ? t('suggestionMarkedConsidered')
          : t('suggestionDismissedToast')
      );
    } catch {
      toast.error(t('suggestionUpdateError'));
    }
  };

  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        onClick={() => act('accepted')}
        disabled={setStatus.isPending}
        className="flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
      >
        {t('suggestionActionConsider')}
      </button>
    </div>
  );
}

function PhysioMuscleSuggestionActions({
  suggestionId,
  status
}: {
  suggestionId: string;
  status: string;
}) {
  const setStatus = useSetPhysioMuscleSuggestionStatus();
  const toast = useToast();
  const t = useTranslations('clinician.patient');

  if (status !== 'needsReview') {
    return (
      <p className="mt-3 text-[13px] uppercase tracking-wider text-ink-muted">
        {status === 'reviewed'
          ? t('suggestionStatusConsidered')
          : t('suggestionStatusDismissed')}
      </p>
    );
  }

  const act = async (next: 'reviewed' | 'dismissed') => {
    try {
      await setStatus.mutateAsync({ suggestionId, status: next });
      toast.success(
        next === 'reviewed'
          ? t('suggestionMarkedConsidered')
          : t('suggestionDismissedToast')
      );
    } catch {
      toast.error(t('suggestionUpdateError'));
    }
  };

  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        onClick={() => act('reviewed')}
        disabled={setStatus.isPending}
        className="flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
      >
        {t('suggestionActionConsider')}
      </button>
    </div>
  );
}
