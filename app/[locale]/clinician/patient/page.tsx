'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  useCurrentClinicianSession,
  useEndClinicianSession,
  useTouchClinicianSession
} from '@/lib/supabase/clinicianSession';
import {
  useClinicianPatientData,
  useSetSuggestionStatus
} from '@/lib/supabase/clinicianPatient';
import { formatLongDate } from '@/lib/dates';
import type { GuidanceMethod } from '@/lib/types';
import { GoalProgressView } from '@/components/clinician/GoalProgressView';
import { ExportModal } from '@/components/clinician/ExportModal';
import { NewCycleDialog } from '@/components/clinician/NewCycleDialog';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { buildEhrExport } from '@/lib/ehrExport';

export default function ClinicianPatientPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('clinician.patient');
  const tSession = useTranslations('clinician.session');
  const tDomain = useTranslations('domain');
  const tImportance = useTranslations('importance');

  const { user, profile, loading: authLoading } = useAuth();
  const sessionQuery = useCurrentClinicianSession(
    profile?.id ?? null,
    profile?.role
  );
  const patientData = useClinicianPatientData(
    profile?.id ?? null,
    profile?.role,
    sessionQuery.data?.patientId ?? null
  );

  const endSession = useEndClinicianSession();
  const touchSession = useTouchClinicianSession();
  const setStatus = useSetSuggestionStatus();

  const [confirmEnd, setConfirmEnd] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showNewCycle, setShowNewCycle] = useState(false);

  // Auth + role gating.
  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) {
      router.replace(locale === 'en' ? '/login' : `/${locale}/login`);
      return;
    }
    if (profile.role !== 'clinician') {
      router.replace(locale === 'en' ? '/' : `/${locale}`);
    }
  }, [authLoading, user, profile, router, locale]);

  // No session → back to unlock screen, with a "?timeout=1" hint that
  // surfaces a friendly message there. We can't distinguish "session
  // never existed" from "session timed out" perfectly, but if the
  // sessionQuery completed and returned null we treat it as timeout.
  useEffect(() => {
    if (!sessionQuery.isLoading && sessionQuery.data === null) {
      router.replace(
        (locale === 'en' ? '/clinician' : `/${locale}/clinician`) +
          '?timeout=1'
      );
    }
  }, [sessionQuery.isLoading, sessionQuery.data, router, locale]);

  if (
    authLoading ||
    !profile ||
    profile.role !== 'clinician' ||
    sessionQuery.isLoading ||
    !sessionQuery.data
  ) {
    return <div className="min-h-dvh bg-cream" />;
  }

  if (patientData.isLoading || !patientData.data) {
    return (
      <div className="min-h-dvh bg-cream">
        <main className="mx-auto max-w-[480px] px-5 pb-16 pt-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-24 rounded bg-stone" />
            <div className="h-6 w-2/3 rounded bg-stone" />
            <div className="h-32 rounded bg-stone-soft" />
            <div className="h-48 rounded bg-stone-soft" />
          </div>
        </main>
      </div>
    );
  }

  const { patient, cycle, suggestions, activeGoals, checkins, treatment } =
    patientData.data;

  // Compute current week from cycle.start_date and today.
  const startMs = new Date(cycle.startDate).getTime();
  const todayMs = Date.now();
  const daysSinceStart = Math.floor(
    (todayMs - startMs) / (24 * 60 * 60 * 1000)
  );
  const weekNumber = Math.max(1, Math.floor(daysSinceStart / 7) + 1);

  // Build per-goal ratings for the progress views.
  const ratingsByGoal = new Map<
    string,
    {
      weekNumber: number;
      value: -2 | -1 | 0 | 1 | 2 | null;
      nrs: number | null;
      reported: boolean;
      comment?: string;
    }[]
  >();
  for (const goal of activeGoals) {
    const perWeek = checkins
      .flatMap((c) => {
        const r = c.ratings.find((x) => x.approvedGoalId === goal.id);
        if (!r) return [];
        return [
          {
            weekNumber: c.weekNumber,
            value: r.ratingValue as -2 | -1 | 0 | 1 | 2 | null,
            nrs: r.nrsValue,
            reported: true,
            comment: c.comment ?? undefined
          }
        ];
      })
      .sort((a, b) => a.weekNumber - b.weekNumber);
    ratingsByGoal.set(goal.id, perWeek);
  }

  const onEndSession = async () => {
    await endSession.mutateAsync();
    router.replace(locale === 'en' ? '/clinician' : `/${locale}/clinician`);
  };

  // Touch session on any meaningful click. Safe to call unconditionally
  // — the RPC silently no-ops for non-clinicians.
  const touch = () => touchSession.mutate();

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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setConfirmEnd(true)}
              className="text-[13px] font-semibold text-ink-soft hover:text-ink"
            >
              {tSession('endSession')}
            </button>
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-5 pb-16 pt-6">
        <div className="eyebrow">
          {t('cycleContext', {
            cycle: cycle.cycleNumber,
            week: weekNumber
          })}
        </div>
        <p className="mt-1 text-[15px] text-ink-soft">
          {t('treatmentDate', {
            date: formatLongDate(cycle.startDate, locale)
          })}
        </p>

        {/* Treatment record card */}
        <section className="mt-6 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
          {treatment ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="eyebrow">Treatment</div>
                  <p className="mt-0.5 font-display text-[16px] text-ink">
                    {treatment.drugProduct} · {treatment.totalUnits} units ·{' '}
                    {formatLongDate(treatment.date, locale)}
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-soft">
                    {labelForGuidance(treatment.guidance)}
                    {treatment.dilution && ` · Dilution: ${treatment.dilution}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    touch();
                    router.push(
                      locale === 'en'
                        ? '/clinician/treatment'
                        : `/${locale}/clinician/treatment`
                    );
                  }}
                  className="shrink-0 text-[13px] font-semibold text-sage-deep hover:underline"
                >
                  Edit
                </button>
              </div>
              <ul className="mt-3 space-y-1.5 text-[13px] text-ink-soft">
                {treatment.injections.map((inj) => (
                  <li key={inj.id}>
                    <span>
                      {inj.muscle} · {inj.side} · {inj.doseUnits} units
                    </span>
                    {inj.note && (
                      <span className="ml-1 italic text-ink-muted">
                        — {inj.note}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {treatment.notes && (
                <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">
                  <span className="text-ink-muted">Notes: </span>
                  {treatment.notes}
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
                onClick={() => {
                  touch();
                  router.push(
                    locale === 'en'
                      ? '/clinician/treatment'
                      : `/${locale}/clinician/treatment`
                  );
                }}
                className="mt-3 flex h-10 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-cream-soft hover:bg-ink-soft"
              >
                Record treatment
              </button>
            </>
          )}
        </section>

        {/* Start new cycle */}
        <button
          type="button"
          onClick={() => {
            touch();
            setShowNewCycle(true);
          }}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft"
        >
          Start new treatment cycle
        </button>

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
                    currentWeek={weekNumber}
                    ratings={ratingsByGoal.get(g.id) ?? []}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Suggestions awaiting review */}
        <section className="mt-10">
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
                    &ldquo;{s.patientWording}&rdquo;
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      touch();
                      router.push(
                        locale === 'en'
                          ? `/clinician/suggestion?id=${s.id}`
                          : `/${locale}/clinician/suggestion?id=${s.id}`
                      );
                    }}
                    className="mt-3 flex h-10 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-cream-soft hover:bg-ink-soft"
                  >
                    {t('review')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Patient comments are now reachable from the chart — tap any
            dot showing a speech-bubble icon to see the comment in the
            caption below the chart. */}

        {/* EHR export */}
        {(treatment || activeGoals.length > 0 || checkins.length > 0) && (
          <div className="mt-10">
            <button
              type="button"
              onClick={() => {
                touch();
                setShowExport(true);
              }}
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
            patient: { displayName: patient.displayName },
            cycle: {
              cycleNumber: cycle.cycleNumber,
              startDate: cycle.startDate
            },
            treatment: treatment
              ? {
                  date: treatment.date,
                  drugProduct: treatment.drugProduct,
                  totalUnits: treatment.totalUnits,
                  dilution: treatment.dilution ?? undefined,
                  guidance: treatment.guidance as GuidanceMethod,
                  injections: treatment.injections.map((i) => ({
                    muscle: i.muscle,
                    side: i.side,
                    doseUnits: i.doseUnits,
                    note: i.note ?? undefined
                  })),
                  notes: treatment.notes ?? undefined
                }
              : undefined,
            goals: activeGoals.map((g) => ({
              id: g.id,
              patientFacingText: g.patientFacingText
            })),
            checkins: checkins.map((c) => ({
              weekNumber: c.weekNumber,
              comment: c.comment ?? undefined,
              ratings: c.ratings.map((r) => ({
                approvedGoalId: r.approvedGoalId,
                ratingValue: r.ratingValue as -2 | -1 | 0 | 1 | 2 | null,
                nrsValue: r.nrsValue
              }))
            })),
            locale
          })}
          onClose={() => setShowExport(false)}
        />
      )}

      {showNewCycle && (
        <NewCycleDialog
          patientId={patient.id}
          onClose={() => setShowNewCycle(false)}
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
                onClick={onEndSession}
                disabled={endSession.isPending}
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

function labelForGuidance(g: string): string {
  switch (g) {
    case 'emg':
      return 'EMG';
    case 'ultrasound':
      return 'Ultrasound';
    case 'usEmg':
      return 'Ultrasound + EMG';
    case 'electricalStimulation':
      return 'Electrical stimulation';
    case 'anatomicalLandmarks':
      return 'Anatomical landmarks';
    case 'none':
      return 'No guidance';
    case 'other':
      return 'Other';
    default:
      return g;
  }
}
