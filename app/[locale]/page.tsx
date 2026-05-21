'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { addDaysIso } from '@/lib/dates';
import { useAuth } from '@/lib/supabase/auth';
import { usePatientHomeData } from '@/lib/supabase/patientHome';
import { AppShell } from '@/components/layout/AppShell';
import { PatientHomeSkeleton } from '@/components/layout/PatientHomeSkeleton';
import { SafetyNotice } from '@/components/layout/SafetyNotice';
import { GoalCard } from '@/components/cards/GoalCard';
import { CheckinPromptCard } from '@/components/cards/CheckinPromptCard';
import { CatchUpCard } from '@/components/cards/CatchUpCard';
import { CheckinDots } from '@/components/cards/CheckinDots';
import { NotificationsCard } from '@/components/cards/NotificationsCard';
import { Card } from '@/components/cards/Card';

export default function PatientHomePage() {
  const router = useRouter();
  const t = useTranslations('patient.home');
  const locale = useLocale();

  const { user, profile, loading: authLoading } = useAuth();
  const homeQuery = usePatientHomeData(profile?.id ?? null, profile?.role);

  // Auth redirects: not signed in → /login; clinician → /clinician.
  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) {
      router.replace(locale === 'en' ? '/login' : `/${locale}/login`);
      return;
    }
    if (profile.role === 'clinician') {
      router.replace(locale === 'en' ? '/clinician' : `/${locale}/clinician`);
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
            Could not load your information right now.
          </p>
          <p className="mt-1.5 text-[14px] text-ink-soft">
            Check your internet connection and try refreshing.
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
              No treatment cycle yet.
            </p>
            <p className="mt-1.5 text-[14px] text-ink-soft">
              Your clinic will set up your first cycle at your next visit.
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
    <AppShell>
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

      {/* Notifications opt-in (hidden once subscribed or dismissed) */}
      <NotificationsCard profileId={data.patient.id} />

      {/* Check-in CTA / next-due */}
      <div className="mt-6">
        <CheckinPromptCard
          pendingPromptId={data.currentPrompt?.id}
          nextDueDate={nextDueDate}
          patientId={data.patient.id}
          hasActiveGoals={data.goals.length > 0}
        />
      </div>

      {/* Catch-up card: older pending check-ins within the 2-week window */}
      {data.catchUpPrompts.length > 0 && data.goals.length > 0 && (
        <CatchUpCard prompts={data.catchUpPrompts} />
      )}

      {/* Visual cycle progress — grows each week, only shown when there are active goals */}
      {data.goals.length > 0 && (
        <CheckinDots
          currentWeek={weekNumber}
          completedWeeks={completedWeeksSet}
          pendingPromptWeek={data.currentPrompt?.weekNumber}
        />
      )}

      {/* Goals section */}
      <section className="mt-9" aria-labelledby="goals-heading">
        <h2
          id="goals-heading"
          className="font-display text-[22px] leading-tight text-ink"
        >
          {t('yourGoals')}
        </h2>

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
                <GoalCard patientFacingText={g.patientFacingText} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Suggest goal action */}
      <button
        type="button"
        onClick={() => {
          router.push(
            locale === 'en' ? '/suggest-goal' : `/${locale}/suggest-goal`
          );
        }}
        className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] border border-sage/40 bg-cream-soft px-5 text-[15px] font-semibold text-sage-deep hover:bg-sage-soft"
      >
        <span aria-hidden className="mr-2 text-[18px] leading-none">
          +
        </span>
        {t('suggestGoal')}
      </button>

      {/* Visit code — quiet secondary action for the in-clinic moment */}
      <button
        type="button"
        onClick={() =>
          router.push(
            locale === 'en' ? '/visit-code' : `/${locale}/visit-code`
          )
        }
        className="mt-3 flex h-11 w-full items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
      >
        {t('generateVisitCode')}
      </button>

      {/* Safety notice */}
      <div className="mt-10">
        <SafetyNotice />
      </div>
    </AppShell>
  );
}
