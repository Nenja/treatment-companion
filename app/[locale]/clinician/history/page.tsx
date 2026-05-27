'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useCurrentClinicianSession } from '@/lib/supabase/clinicianSession';
import { usePatientTrend } from '@/lib/supabase/patientTrend';
import { usePatientCycleAnalysis } from '@/lib/supabase/patientCycleAnalysis';
import {
  DosePerCycleChart,
  OutcomePerCycleChart
} from '@/components/clinician/CycleTrendCharts';
import {
  BenefitDurationTable,
  MuscleDoseChart,
  RetreatmentTimingTable
} from '@/components/clinician/CycleAnalysisViews';
import { SkeletonScreen, SkeletonBlock } from '@/components/feedback/Skeleton';

/**
 * Longitudinal trend page — physician only.
 *
 * Reached from the clinician patient page ("View history across
 * cycles"). Shows, for the patient in the current session, how total
 * dose and goal outcome have changed across all of their treatment
 * cycles.
 *
 * It uses the SAME active clinician session as the patient page — the
 * physician has already unlocked the patient — so it reads the
 * patient id from the session rather than taking it in the URL.
 *
 * Session guard mirrors the patient page: it only redirects to the
 * unlock screen on a SETTLED no-session result (status 'success' +
 * null data), never on a transient null during a background refetch.
 */
export default function ClinicianHistoryPage() {
  const router = useRouter();
  const locale = useLocale();
  const prefix = locale === 'en' ? '' : `/${locale}`;
  const t = useTranslations('clinician.history');
  const { profile, loading: authLoading } = useAuth();

  const sessionQuery = useCurrentClinicianSession(
    profile?.id ?? null,
    profile?.role ?? null
  );
  const patientId = sessionQuery.data?.patientId ?? null;
  const trend = usePatientTrend(patientId);
  const analysis = usePatientCycleAnalysis(patientId);

  // Auth + role gate.
  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      router.replace(prefix ? `${prefix}/login` : '/login');
      return;
    }
    if (profile.role !== 'clinician') {
      router.replace(prefix ? `${prefix}/` : '/');
    }
  }, [authLoading, profile, router, prefix]);

  // No active session → back to the unlock screen. Settled result only.
  useEffect(() => {
    if (sessionQuery.status === 'success' && sessionQuery.data === null) {
      router.replace(prefix ? `${prefix}/clinician` : '/clinician');
    }
  }, [sessionQuery.status, sessionQuery.data, router, prefix]);

  if (
    authLoading ||
    !profile ||
    profile.role !== 'clinician' ||
    sessionQuery.isLoading ||
    !sessionQuery.data
  ) {
    return (
      <SkeletonScreen>
        <SkeletonBlock width="w-2/3" height="h-8" />
        <SkeletonBlock height="h-40" className="mt-6" />
        <SkeletonBlock height="h-40" className="mt-6" />
      </SkeletonScreen>
    );
  }

  const patientPath = prefix
    ? `${prefix}/clinician/patient`
    : '/clinician/patient';

  const cycles = trend.data?.cycles ?? [];

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className="mx-auto flex max-w-[480px] items-center px-5 py-4">
          <button
            type="button"
            onClick={() => router.push(patientPath)}
            className="text-[14px] font-semibold text-ink-soft hover:text-ink"
          >
            {t('back')}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-5 py-8">
        <h1 className="font-display text-[24px] leading-tight text-ink">
          {t('title')}
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
          {t('subtitle')}
        </p>

        {trend.isLoading && (
          <SkeletonBlock height="h-40" className="mt-6" />
        )}

        {!trend.isLoading && cycles.length === 0 && (
          <p className="mt-8 rounded-[var(--radius-card)] border border-dashed border-stone bg-cream-soft/60 p-5 text-[14px] leading-relaxed text-ink-soft">
            {t('noData')}
          </p>
        )}

        {/* One cycle only — trends need at least two. Still show the
            single cycle's charts, but explain there is no trend yet. */}
        {!trend.isLoading && cycles.length === 1 && (
          <p className="mt-6 rounded-[var(--radius-card)] border border-stone bg-cream-soft px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
            {t('empty')}
          </p>
        )}

        {!trend.isLoading && cycles.length >= 1 && (
          <div className="mt-7 space-y-8">
            <section className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
              <DosePerCycleChart
                cycles={cycles}
                unitsLabel={t('doseChartTitle')}
                cycleLabel={t('cycleShort')}
              />
            </section>

            <section className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
              <OutcomePerCycleChart
                cycles={cycles}
                outcomeLabel={t('outcomeChartTitle')}
                cycleLabel={t('cycleShort')}
              />
              <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
                {t('outcomeNote')}
              </p>
            </section>

            {/* --- Deeper analysis: only meaningful with 2+ cycles --- */}
            {(analysis.data?.cycles.length ?? 0) >= 2 && (
              <>
                {/* Benefit duration */}
                <section className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
                  <h2 className="text-[13px] font-semibold text-ink-soft">
                    {t('benefitTitle')}
                  </h2>
                  <div className="mt-3">
                    <BenefitDurationTable
                      cycles={analysis.data!.cycles}
                      labels={{
                        cycle: t('cycleShort'),
                        peak: t('colPeak'),
                        duration: t('colDuration'),
                        weeks: t('colWeeks'),
                        held: t('benefitHeld'),
                        noData: t('noData')
                      }}
                    />
                  </div>
                  <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
                    {t('benefitNote')}
                  </p>
                </section>

                {/* Per-muscle dose */}
                <section className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
                  <h2 className="text-[13px] font-semibold text-ink-soft">
                    {t('muscleTitle')}
                  </h2>
                  <div className="mt-3">
                    <MuscleDoseChart
                      trends={analysis.data!.muscleTrends}
                      cycleLabel={t('cycleShort')}
                      emptyLabel={t('muscleEmpty')}
                    />
                  </div>
                  <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
                    {t('muscleNote')}
                  </p>
                </section>

                {/* Re-treatment timing */}
                <section className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
                  <h2 className="text-[13px] font-semibold text-ink-soft">
                    {t('retreatTitle')}
                  </h2>
                  <div className="mt-3">
                    <RetreatmentTimingTable
                      cycles={analysis.data!.cycles}
                      labels={{
                        cycle: t('cycleShort'),
                        interval: t('colInterval'),
                        fadeVsRetreat: t('colTiming'),
                        weeks: t('colWeeks'),
                        held: t('benefitHeld'),
                        noNext: t('retreatNoNext'),
                        faded: t('retreatFaded'),
                        onTime: t('retreatOnTime'),
                        late: t('retreatLate')
                      }}
                    />
                  </div>
                  <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
                    {t('retreatNote')}
                  </p>
                </section>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
