'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useStore, actions } from '@/lib/store';
import { weekOfCycle, formatLongDate } from '@/lib/dates';
import { useSessionTimeout } from '@/lib/useSessionTimeout';
import { GoalProgressView } from '@/components/clinician/GoalProgressView';
import { ExportModal } from '@/components/clinician/ExportModal';
import { buildEhrExport } from '@/lib/ehrExport';

export default function ClinicianPatientPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('clinician.patient');
  const tSession = useTranslations('clinician.session');
  const tDomain = useTranslations('domain');
  const tImportance = useTranslations('importance');
  const state = useStore();

  const session = state.clinicianSession;
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [showExport, setShowExport] = useState(false);

  useSessionTimeout({
    onTimeout: () => {
      actions.endClinicianSession();
      router.replace(
        locale === 'en' ? '/clinician' : `/${locale}/clinician`
      );
    }
  });

  // If no session, kick back to the unlock page.
  useEffect(() => {
    if (!session) {
      router.replace(
        locale === 'en' ? '/clinician' : `/${locale}/clinician`
      );
    }
  }, [session, router, locale]);

  if (!session) return null;

  const patient = state.patients.find((p) => p.id === session.patientId);
  if (!patient) return null;

  const cycle = state.treatmentCycles.find(
    (c) => c.id === patient.activeTreatmentCycleId
  );
  if (!cycle) return null;

  const weekNumber = weekOfCycle(cycle.startDate, state.now);
  const totalWeeks = cycle.lengthWeeks ?? 12;

  const suggestions = state.goalSuggestions
    .filter(
      (g) =>
        g.patientId === patient.id &&
        g.treatmentCycleId === cycle.id &&
        g.status === 'needsReview'
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const activeGoals = state.approvedGoals
    .filter(
      (g) =>
        g.patientId === patient.id &&
        g.treatmentCycleId === cycle.id &&
        g.status === 'active'
    )
    .sort((a, b) => a.approvedAt.localeCompare(b.approvedAt));

  // For each active goal, build a week → rating map from the patient's
  // completed check-ins this cycle.
  const cycleCheckins = state.weeklyCheckins.filter(
    (c) => c.treatmentCycleId === cycle.id
  );

  // Treatment record (if any) for this cycle.
  const cycleTreatment = state.treatmentSessions.find(
    (t) => t.treatmentCycleId === cycle.id
  );

  const ratingsByGoal = new Map<
    string,
    {
      weekNumber: number;
      value: -2 | -1 | 0 | 1 | 2 | null;
      reported: boolean;
      comment?: string;
    }[]
  >();
  for (const goal of activeGoals) {
    const perWeek = cycleCheckins
      .map((c) => {
        const r = c.ratings.find((x) => x.approvedGoalId === goal.id);
        if (!r) return null;
        return {
          weekNumber: c.weekNumber,
          value: r.ratingValue as -2 | -1 | 0 | 1 | 2 | null,
          reported: true,
          comment: c.comment
        };
      })
      .filter(
        (
          x
        ): x is {
          weekNumber: number;
          value: -2 | -1 | 0 | 1 | 2 | null;
          reported: boolean;
          comment?: string;
        } => x !== null
      )
      .sort((a, b) => a.weekNumber - b.weekNumber);
    ratingsByGoal.set(goal.id, perWeek);
  }

  const endSession = () => {
    actions.endClinicianSession();
    router.replace(locale === 'en' ? '/clinician' : `/${locale}/clinician`);
  };

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className="mx-auto flex max-w-[480px] items-center justify-between px-5 py-4">
          <div>
            <div className="eyebrow">{t('viewingLabel')}</div>
            <div className="font-display text-[20px] leading-tight text-ink">
              {patient.displayName}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            className="text-[13px] font-semibold text-ink-soft hover:text-ink"
          >
            {tSession('endSession')}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-5 pb-16 pt-6">
        <div className="eyebrow">
          {t('cycleContext', {
            cycle: cycle.cycleNumber,
            week: weekNumber,
            total: totalWeeks
          })}
        </div>
        <p className="mt-1 text-[15px] text-ink-soft">
          {t('nextVisit', { date: formatLongDate(cycle.reviewDate, locale) })}
        </p>

        {/* Treatment record card — shown at the top because it's the
            anchor of the cycle. Either summarises the recorded session
            or invites the clinician to record one. */}
        <section className="mt-6 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
          {cycleTreatment ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="eyebrow">Treatment</div>
                  <p className="mt-0.5 font-display text-[16px] text-ink">
                    {cycleTreatment.drugProduct} · {cycleTreatment.totalUnits} units · {formatLongDate(cycleTreatment.date, locale)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      locale === 'en'
                        ? '/clinician/treatment'
                        : `/${locale}/clinician/treatment`
                    )
                  }
                  className="shrink-0 text-[13px] font-semibold text-sage-deep hover:underline"
                >
                  Edit
                </button>
              </div>
              <ul className="mt-3 space-y-1.5 text-[13px] text-ink-soft">
                {cycleTreatment.injections.map((inj) => (
                  <li key={inj.id}>
                    {inj.muscle} · {inj.side} · {inj.doseUnits} units · {inj.guidance}
                  </li>
                ))}
              </ul>
              {cycleTreatment.notes && (
                <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">
                  <span className="text-ink-muted">Notes: </span>
                  {cycleTreatment.notes}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="eyebrow">Treatment</div>
              <p className="mt-1 text-[14px] text-ink-soft">
                No treatment recorded for this cycle yet.
              </p>
              <button
                type="button"
                onClick={() =>
                  router.push(
                    locale === 'en'
                      ? '/clinician/treatment'
                      : `/${locale}/clinician/treatment`
                  )
                }
                className="mt-3 flex h-10 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-cream-soft hover:bg-ink-soft"
              >
                Record treatment
              </button>
            </>
          )}
        </section>

        {/* Suggestions awaiting review */}
        <section className="mt-9">
          <h2 className="font-display text-[20px] leading-tight text-ink">
            {t('suggestionsTitle')}
          </h2>
          {suggestions.length === 0 ? (
            <p className="mt-3 text-[14px] text-ink-muted">
              {t('suggestionsEmpty')}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="eyebrow text-ink-muted">
                      {tDomain(s.domain)} · {tImportance(s.importance)}
                    </div>
                  </div>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-ink">
                    "{s.patientWording}"
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        locale === 'en'
                          ? `/clinician/suggestion?id=${s.id}`
                          : `/${locale}/clinician/suggestion?id=${s.id}`
                      )
                    }
                    className="mt-3 flex h-10 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-cream-soft hover:bg-ink-soft"
                  >
                    {t('review')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Active goals with progress visualisation */}
        <section className="mt-10">
          <h2 className="font-display text-[20px] leading-tight text-ink">
            {t('activeGoalsTitle')}
          </h2>
          {activeGoals.length === 0 ? (
            <p className="mt-3 text-[14px] text-ink-muted">
              {t('activeGoalsEmpty')}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {activeGoals.map((g) => (
                <li key={g.id}>
                  <GoalProgressView
                    goalText={g.patientFacingText}
                    totalWeeks={totalWeeks}
                    currentWeek={weekNumber}
                    ratings={ratingsByGoal.get(g.id) ?? []}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Patient comments across the cycle — chronological */}
        {cycleCheckins.some((c) => c.comment?.trim()) && (
          <section className="mt-10">
            <h2 className="font-display text-[20px] leading-tight text-ink">
              Patient comments
            </h2>
            <ul className="mt-3 space-y-3">
              {cycleCheckins
                .filter((c) => c.comment?.trim())
                .sort((a, b) => b.weekNumber - a.weekNumber)
                .map((c) => (
                  <li
                    key={c.id}
                    className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
                  >
                    <div className="eyebrow text-ink-muted">
                      Week {c.weekNumber}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
                      {c.comment}
                    </p>
                  </li>
                ))}
            </ul>
          </section>
        )}

        {/* Export for EHR — only useful when there's actually data to export */}
        {(cycleTreatment || activeGoals.length > 0 || cycleCheckins.length > 0) && (
          <div className="mt-10">
            <button
              type="button"
              onClick={() => setShowExport(true)}
              className="flex h-11 w-full items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
            >
              Export for EHR
            </button>
          </div>
        )}
      </main>

      {showExport && (
        <ExportModal
          initialText={buildEhrExport({
            patient,
            cycle,
            treatment: cycleTreatment,
            goals: activeGoals,
            checkins: cycleCheckins,
            locale
          })}
          onClose={() => setShowExport(false)}
        />
      )}

      {confirmEnd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
          <div className="w-full max-w-[400px] rounded-[var(--radius-card)] border border-stone bg-cream p-6 shadow-xl">
            <h2 className="font-display text-[20px] text-ink">
              {tSession('endSessionConfirm')}
            </h2>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setConfirmEnd(false)}
                className="flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-cream-soft hover:bg-ink-soft"
              >
                {tSession('endSessionConfirmKeep')}
              </button>
              <button
                type="button"
                onClick={endSession}
                className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
              >
                {tSession('endSessionConfirmEnd')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
