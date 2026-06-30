'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { addDaysIso } from '@/lib/dates';
import { useAuth } from '@/lib/supabase/auth';
import { usePatientHomeData } from '@/lib/supabase/patientHome';
import { AppShell } from '@/components/layout/AppShell';
import { CheckinOutboxBanner } from '@/components/patient/CheckinOutboxBanner';
import { PatientHomeSkeleton } from '@/components/layout/PatientHomeSkeleton';
import { SafetyNotice } from '@/components/layout/SafetyNotice';
import { CheckinPromptCard } from '@/components/cards/CheckinPromptCard';
import { CatchUpCard } from '@/components/cards/CatchUpCard';
import { NotificationDayModal } from '@/components/cards/NotificationDayModal';
import { pushSupported } from '@/lib/pwa';
import { Card } from '@/components/cards/Card';
import { OnboardingWizard } from '@/components/feedback/OnboardingWizard';
import { CareTeamNotes } from '@/components/patient/CareTeamNotes';

export default function PatientHomePage() {
  const router = useRouter();
  const t = useTranslations('patient.home');
  const locale = useLocale();

  const { user, profile, loading: authLoading } = useAuth();
  const homeQuery = usePatientHomeData(profile?.id ?? null, profile?.role);

  // Weekly-reminder-day modal visibility + per-session dismissal.
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [notifModalDone, setNotifModalDone] = useState(false);

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

  // Weekly-reminder-day modal: show to a patient who hasn't chosen a
  // reminder day, on a push-capable browser. Re-shown every login until
  // a day is set (skip only dismisses for the session). Client-gated to
  // avoid an SSR/hydration flip.
  useEffect(() => {
    if (notifModalDone) return;
    const eligible =
      profile?.role === 'patient' &&
      profile?.notifyWeekday == null &&
      pushSupported();
    setShowNotifModal(Boolean(eligible));
  }, [profile?.role, profile?.notifyWeekday, notifModalDone]);

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

        {data.pendingSuggestions > 0 && (
          <div className="mt-4">
            <Card tone="muted">
              <p className="text-[14px] leading-relaxed text-ink-soft">
                {t('pendingSuggestions', { count: data.pendingSuggestions })}
              </p>
            </Card>
          </div>
        )}

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

        {/* Pre-visit goal capture. A patient can suggest goals before any
            cycle exists; the clinician reviews and sets them up to track at
            the visit. This turns the otherwise dead-end empty state into a
            real next action. */}
        <div className="mt-4">
          <Card tone="muted">
            <p className="font-display text-[18px] text-ink">
              {t('noCycleSuggestTitle')}
            </p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
              {t('noCycleSuggestBody')}
            </p>
            <button
              type="button"
              onClick={() =>
                router.push(
                  locale === 'en' ? '/suggest-goal' : `/${locale}/suggest-goal`
                )
              }
              className="mt-3 flex h-11 w-full items-center justify-center rounded-[var(--radius-button)] border border-sage/40 bg-cream-soft px-3 text-[14px] font-semibold text-sage-deep hover:bg-sage-soft"
            >
              <span aria-hidden className="mr-2 text-[17px] leading-none">
                +
              </span>
              {t('suggestGoal')}
            </button>
          </Card>
        </div>

        {/* What to bring to the visit — the visit code is how the clinician
            opens the patient's record at the appointment. Taught here (and
            in onboarding) so the empty state explains the next real step. */}
        <div className="mt-4">
          <Card tone="muted">
            <p className="font-display text-[18px] text-ink">
              {t('visitCodeTitle')}
            </p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
              {t('visitCodeBody')}
            </p>
            <button
              type="button"
              onClick={() =>
                router.push(
                  locale === 'en' ? '/visit-code' : `/${locale}/visit-code`
                )
              }
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-button)] border border-sage/40 bg-cream-soft px-3 text-[14px] font-semibold text-sage-deep hover:bg-sage-soft"
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

  return (
    <AppShell helpPageKey="patientHome">
      {/* One-time orientation — shown only on a new patient's first visit. */}
      <OnboardingWizard role="patient" replayOnly />

      {/* Offline: replays any queued check-in once back online; shows a quiet
          status line while some are still waiting. */}
      <CheckinOutboxBanner />

      {/* Cycle context eyebrow — plain language, just "weeks since
          treatment" so the patient doesn't have to think in cycles. */}
      <div className="eyebrow mb-2">
        {t('cycleContext', {
          week: weekNumber
        })}
      </div>
      {/* Greeting */}
      <h1 data-tour="greeting" className="font-display text-[24px] leading-tight text-ink">
        {t('greeting', { name: data.patient.displayName })}
      </h1>

      {/* PRIMARY ACTION — the check-in CTA. The one thing the patient
          is here to do, so it leads the screen, directly under the
          greeting, before anything secondary. */}
      <div data-tour="checkin" className="mt-6">
        <CheckinPromptCard
          pendingPromptId={data.currentPrompt?.id}
          nextDueDate={nextDueDate}
          patientId={data.patient.id}
          hasActiveGoals={data.goals.length > 0}
          catchUp={
            data.catchUpPrompts.length > 0 && data.goals.length > 0 ? (
              <CatchUpCard prompts={data.catchUpPrompts} />
            ) : undefined
          }
        />
      </div>

      {/* Your goals — one prominent entry to the dedicated goals page,
          which holds the goal cards, progress graphs and the suggest
          flow. Keeps the home short with goals one tap away. */}
      <button
        type="button"
        onClick={() =>
          router.push(locale === 'en' ? '/goals' : `/${locale}/goals`)
        }
        data-tour="goals"
        className="mt-8 flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-sage/50 px-5 py-4 text-left hover:bg-sage-soft/30"
      >
        <span className="min-w-0">
          <span className="block font-display text-[20px] leading-tight text-ink">
            {t('yourGoals')}
          </span>
          <span className="mt-0.5 block text-[13px] text-ink-muted">
            {t('goalsActiveCount', { count: data.goals.length })}
          </span>
        </span>
        <svg
          aria-hidden
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-ink-soft"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      {/* Show visit code — a utility row below the goals entry, kept
          obvious (full-width, icon, chevron). Visit-time only; navigates
          to the code screen. */}
      <button
        type="button"
        onClick={() =>
          router.push(
            locale === 'en' ? '/visit-code' : `/${locale}/visit-code`
          )
        }
        data-tour="visitcode"
        className="mt-3 flex w-full items-center justify-between border-b border-stone/60 py-4 text-left"
      >
        <span className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="text-sage-deep"
          >
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M7 10v4M11 10v4M15 10v4M19 10v4" />
          </svg>
          {t('showVisitCode')}
        </span>
        <svg
          aria-hidden
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-ink-soft"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      <CareTeamNotes />

      {/* Safety notice + a quiet data & privacy link. The visit-code row's
          hairline above acts as the divider, so this notice drops its own top
          rule and sits close beneath it (no empty band, no double line). */}
      <div className="mt-5">
        <SafetyNotice topRule={false} />
        <button
          type="button"
          onClick={() =>
            router.push(locale === 'en' ? '/privacy' : `/${locale}/privacy`)
          }
          className="mt-4 flex w-full items-center justify-center text-[13px] font-medium text-ink-muted hover:text-ink-soft"
        >
          {t('dataPrivacy')}
        </button>
      </div>

      {/* Weekly check-in reminder day — shown on login to a patient who
          hasn't chosen a reminder day yet (re-shown until set). Sits in
          the cycle branch, so it only appears once there are check-ins. */}
      {showNotifModal && (
        <NotificationDayModal
          onClose={() => {
            setNotifModalDone(true);
            setShowNotifModal(false);
          }}
        />
      )}

    </AppShell>
  );
}
