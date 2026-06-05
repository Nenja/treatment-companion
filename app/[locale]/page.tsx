'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { addDaysIso } from '@/lib/dates';
import { useAuth } from '@/lib/supabase/auth';
import {
  usePatientHomeData,
  type PatientHomeData
} from '@/lib/supabase/patientHome';
import { AppShell } from '@/components/layout/AppShell';
import { PatientHomeSkeleton } from '@/components/layout/PatientHomeSkeleton';
import { SafetyNotice } from '@/components/layout/SafetyNotice';
import { GoalCard } from '@/components/cards/GoalCard';
import { GoalGraphModal } from '@/components/clinician/GoalGraphModal';
import { TreatedMusclesModal } from '@/components/cards/TreatedMusclesModal';
import { CheckinPromptCard } from '@/components/cards/CheckinPromptCard';
import { CatchUpCard } from '@/components/cards/CatchUpCard';
import { CheckinDots } from '@/components/cards/CheckinDots';
import { NotificationsCard } from '@/components/cards/NotificationsCard';
import { Card } from '@/components/cards/Card';
import { OnboardingWizard } from '@/components/feedback/OnboardingWizard';

export default function PatientHomePage() {
  const router = useRouter();
  const t = useTranslations('patient.home');
  const locale = useLocale();

  const { user, profile, loading: authLoading } = useAuth();
  const homeQuery = usePatientHomeData(profile?.id ?? null, profile?.role);

  // Which goal's read-only progress graph is open in a pop-up (null = none).
  const [graphGoal, setGraphGoal] = useState<
    PatientHomeData['goals'][number] | null
  >(null);
  // Whether the read-only "treated muscles" pop-up is open.
  const [showMuscles, setShowMuscles] = useState(false);

  // Auth redirects: not signed in → /login; clinician → /clinician.
  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) {
      router.replace(locale === 'en' ? '/login' : `/${locale}/login`);
      return;
    }
    // Non-patients don't belong on the patient home — bounce them to
    // their own area.
    if (profile.role === 'clinician') {
      router.replace(locale === 'en' ? '/clinician' : `/${locale}/clinician`);
    } else if (profile.role === 'physiotherapist') {
      router.replace(locale === 'en' ? '/physio' : `/${locale}/physio`);
    }
  }, [authLoading, user, profile, router, locale]);

  // While auth is resolving OR the user is being redirected away,
  // render a skeleton placeholder so we don't flash "no goals" or an
  // error before the real check fires. This also covers clinicians
  // briefly landing here before the redirect-to-/clinician effect runs.
  if (
    authLoading ||
    !user ||
    !profile ||
    profile.role !== 'patient'
  ) {
    return (
      <AppShell>
        <PatientHomeSkeleton />
      </AppShell>
    );
  }

  // Data is loading from Supabase → skeleton.
  if (homeQuery.isLoading) {
    return (
      <AppShell>
        <PatientHomeSkeleton />
      </AppShell>
    );
  }

  // Query failed entirely → show a quiet error card. The component is
  // deliberately understated; the safety notice still appears below.
  if (homeQuery.isError || !homeQuery.data) {
    return (
      <AppShell>
        <Card tone="muted">
          <p className="font-display text-[18px] text-ink">
            {t('errorBody')}
          </p>
          <p className="mt-1.5 text-[14px] text-ink-soft">
            {t('errorHint')}
          </p>
        </Card>
        <div className="mt-10">
          <SafetyNotice />
        </div>
      </AppShell>
    );
  }

  const data = homeQuery.data;

  // No active cycle is a real state (e.g. a new patient before their
  // first cycle is set up by an admin). Show a friendly empty state
  // rather than crashing.
  if (!data.cycle) {
    return (
      <AppShell>
        <h1 className="font-display text-[30px] leading-tight text-ink">
          {t('greeting', { name: data.patient.displayName })}
        </h1>
        <div className="mt-6">
          <Card tone="muted">
            <p className="font-display text-[18px] text-ink">
              {t('noCycleTitle')}
            </p>
            <p className="mt-1.5 text-[14px] text-ink-soft">
              {t('noCycleBody')}
            </p>
          </Card>
        </div>
        <div className="mt-10">
          <SafetyNotice />
        </div>
      </AppShell>
    );
  }

  // --- Derive view data --------------------------------------------------

  const weekNumber = data.currentWeek;

  const nextDueDate = data.currentPrompt
    ? undefined
    : addDaysIso(data.cycle.startDate, weekNumber * 7);

  const completedWeeksSet = new Set(data.completedWeeks);

  return (
    <AppShell helpPageKey="patientHome">
      {/* One-time orientation — shown only on a new patient's first visit. */}
      <OnboardingWizard role="patient" replayOnly />

      {/* Cycle context eyebrow — plain language, just "weeks since
          treatment" so the patient doesn't have to think in cycles. */}
      <div className="eyebrow mb-2">
        {t('cycleContext', {
          week: weekNumber
        })}
      </div>

      {/* Greeting */}
      <h1 className="font-display text-[30px] leading-tight text-ink">
        {t('greeting', { name: data.patient.displayName })}
      </h1>

      {/* PRIMARY ACTION — the check-in CTA. The one thing the patient
          is here to do, so it leads the screen, directly under the
          greeting, before anything secondary. */}
      <div className="mt-6">
        <CheckinPromptCard
          pendingPromptId={data.currentPrompt?.id}
          nextDueDate={nextDueDate}
          patientId={data.patient.id}
          hasActiveGoals={data.goals.length > 0}
        />
      </div>

      {/* Catch-up card — older pending check-ins. Sits right under the
          primary CTA because it IS check-in work. */}
      {data.catchUpPrompts.length > 0 && data.goals.length > 0 && (
        <CatchUpCard prompts={data.catchUpPrompts} />
      )}

      {/* Notifications opt-in — secondary. Demoted below the check-in
          CTA and styled quietly so it doesn't compete with the primary
          action. Hidden once subscribed or dismissed. */}
      <NotificationsCard profileId={data.patient.id} />

      {/* Goals section */}
      <section className="mt-9" aria-labelledby="goals-heading">
        <h2
          id="goals-heading"
          className="font-display text-[22px] leading-tight text-ink"
        >
          {t('yourGoals')}
        </h2>

        {/* Cycle progress — a quiet factual line under the heading,
            where it reads as context for the goals below rather than
            floating on its own. Only shown when there are goals. */}
        {data.goals.length > 0 && (
          <CheckinDots
            currentWeek={weekNumber}
            completedWeeks={completedWeeksSet}
            pendingPromptWeek={data.currentPrompt?.weekNumber}
          />
        )}

        {data.goals.length === 0 ? (
          <div className="mt-4">
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
          <ul className="mt-4 space-y-3">
            {data.goals.map((g) => (
              <li key={g.id}>
                <GoalCard
                  patientFacingText={g.patientFacingText}
                  viewGraphLabel={
                    g.ratings.length > 0 ? t('viewGraph') : undefined
                  }
                  onViewGraph={
                    g.ratings.length > 0 ? () => setGraphGoal(g) : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {/* Occasional patient actions, paired side-by-side: showing
            the visit code to a clinician, and suggesting a new goal.
            Both are infrequent and patient-initiated, so they share
            the same quiet visual weight, sitting after the goals so
            "add to these" reads naturally for the suggest button. */}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() =>
              router.push(
                locale === 'en' ? '/visit-code' : `/${locale}/visit-code`
              )
            }
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[var(--radius-button)] border border-sage/40 bg-cream-soft px-3 text-[14px] font-semibold text-sage-deep hover:bg-sage-soft"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="6" width="18" height="12" rx="2" />
              <path d="M7 10v4M11 10v4M15 10v4M19 10v4" />
            </svg>
            {t('showVisitCode')}
          </button>
          <button
            type="button"
            onClick={() => {
              router.push(
                locale === 'en' ? '/suggest-goal' : `/${locale}/suggest-goal`
              );
            }}
            className="flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] border border-sage/40 bg-cream-soft px-3 text-[14px] font-semibold text-sage-deep hover:bg-sage-soft"
          >
            <span aria-hidden className="mr-2 text-[17px] leading-none">
              +
            </span>
            {t('suggestGoal')}
          </button>
        </div>

        {/* Quiet, patient-initiated: see which muscles were treated at the
            last treatment, in a read-only pop-up. Only shown when a
            treatment is on record. */}
        {data.latestTreatment && (
          <button
            type="button"
            onClick={() => setShowMuscles(true)}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-button)] border border-sage/40 bg-cream-soft px-3 text-[14px] font-semibold text-sage-deep hover:bg-sage-soft"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            {t('viewTreatedMuscles')}
          </button>
        )}
      </section>

      {/* Safety notice */}
      <div className="mt-10">
        <SafetyNotice />
      </div>

      {/* Read-only progress graph for one goal, opened from a goal card's
          graph button. Reuses the clinician graph (no edit affordances);
          physio assessments are omitted — the patient sees only their own
          self-report. */}
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

      {/* Read-only list of muscles treated at the last treatment. */}
      {showMuscles && data.latestTreatment && (
        <TreatedMusclesModal
          date={data.latestTreatment.date}
          muscles={data.latestTreatment.muscles}
          locale={locale}
          onClose={() => setShowMuscles(false)}
        />
      )}
    </AppShell>
  );
}
