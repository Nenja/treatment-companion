'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  usePatientHomeData,
  type PatientHomeData
} from '@/lib/supabase/patientHome';
import { AppShell } from '@/components/layout/AppShell';
import { PatientHomeSkeleton } from '@/components/layout/PatientHomeSkeleton';
import { GoalCard } from '@/components/cards/GoalCard';
import { GoalGraphModal } from '@/components/clinician/GoalGraphModal';
import { Card } from '@/components/cards/Card';

/**
 * Dedicated patient goals page.
 *
 * Goals used to live inline on the home screen. They were moved here so
 * the home stays short (check-in above the fold) and goals are reached
 * by one prominent "Your goals" button. This page holds the goal cards,
 * each goal's read-only progress graph, the sent-suggestion status, the
 * gentle progress reassurance, and the "suggest a new goal" action.
 *
 * Same auth guards and data source as the home; no clinic-to-patient
 * messaging is introduced.
 */
export default function PatientGoalsPage() {
  const router = useRouter();
  const t = useTranslations('patient.home');
  const locale = useLocale();

  const { user, profile, loading: authLoading } = useAuth();
  const homeQuery = usePatientHomeData(profile?.id ?? null, profile?.role);

  // Which goal's read-only progress graph is open (null = none).
  const [graphGoal, setGraphGoal] = useState<
    PatientHomeData['goals'][number] | null
  >(null);

  const homeHref = locale === 'en' ? '/' : `/${locale}`;

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) {
      router.replace(locale === 'en' ? '/login' : `/${locale}/login`);
      return;
    }
    if (profile.role === 'clinician') {
      router.replace(locale === 'en' ? '/clinician' : `/${locale}/clinician`);
    } else if (profile.role === 'physiotherapist') {
      router.replace(locale === 'en' ? '/physio' : `/${locale}/physio`);
    }
  }, [authLoading, user, profile, router, locale]);

  const BackLink = () => (
    <button
      type="button"
      onClick={() => router.push(homeHref)}
      className="mb-5 inline-flex items-center gap-1 text-[14px] font-medium text-sage-deep hover:text-ink"
    >
      <span aria-hidden>←</span>
      {t('navHome')}
    </button>
  );

  if (authLoading || !user || !profile || profile.role !== 'patient') {
    return (
      <AppShell>
        <PatientHomeSkeleton />
      </AppShell>
    );
  }

  if (homeQuery.isLoading) {
    return (
      <AppShell>
        <PatientHomeSkeleton />
      </AppShell>
    );
  }

  if (homeQuery.isError || !homeQuery.data) {
    return (
      <AppShell>
        <BackLink />
        <Card tone="muted">
          <p className="font-display text-[18px] text-ink">{t('errorBody')}</p>
          <p className="mt-1.5 text-[14px] text-ink-soft">{t('errorHint')}</p>
        </Card>
      </AppShell>
    );
  }

  const data = homeQuery.data;
  const weekNumber = data.currentWeek;

  return (
    <AppShell helpPageKey="goals">
      <BackLink />

      <h1 className="font-display text-[26px] leading-tight text-ink">
        {t('yourGoals')}
      </h1>

      {data.goals.length === 0 ? (
        <div className="mt-5">
          <Card tone="muted">
            <p className="font-display text-[18px] text-ink">
              {t('noActiveGoalsTitle')}
            </p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
              {t('noSuggestionsBody')}
            </p>
          </Card>
        </div>
      ) : (
        <ul data-tour="goalslist" className="mt-5 space-y-3">
          {data.goals.map((g) => (
            <li key={g.id}>
              <GoalCard
                patientFacingText={g.patientFacingText}
                viewGraphLabel={g.ratings.length > 0 ? t('viewGraph') : undefined}
                onViewGraph={g.ratings.length > 0 ? () => setGraphGoal(g) : undefined}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Gentle, honest reassurance — only in the first couple of weeks,
          only when goals are being tracked. */}
      {data.cycle && data.goals.length > 0 && weekNumber <= 2 && (
        <p className="mt-5 text-[13px] leading-relaxed text-ink-muted">
          {t('progressReassurance')}
        </p>
      )}

      {/* Suggest a new goal — the prominent patient action, now living
          with the goals it adds to. */}
      <button
        type="button"
        onClick={() =>
          router.push(locale === 'en' ? '/suggest-goal' : `/${locale}/suggest-goal`)
        }
        data-tour="suggest"
        className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] border border-sage/50 px-4 text-[15px] font-semibold text-sage-deep hover:bg-sage-soft/40"
      >
        <span aria-hidden className="mr-2 text-[17px] leading-none">+</span>
        {t('suggestGoal')}
      </button>

      {/* Sent-suggestion status — confirms the patient's input arrived.
          Below the suggest action. */}
      {data.pendingSuggestions > 0 && (
        <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">
          {t('pendingSuggestions', { count: data.pendingSuggestions })}
        </p>
      )}

      {graphGoal && (
        <GoalGraphModal
          goalText={graphGoal.patientFacingText}
          kind={graphGoal.kind}
          currentWeek={data.currentWeek}
          ratings={graphGoal.ratings}
          physioRatings={[]}
          nrsDirection={graphGoal.nrsDirection}
          closeLabel={t('graphClose')}
          onClose={() => setGraphGoal(null)}
        />
      )}
    </AppShell>
  );
}
