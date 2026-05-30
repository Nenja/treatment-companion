'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  useCurrentClinicianSession,
  useEndClinicianSession,
  useTouchClinicianSession
} from '@/lib/supabase/clinicianSession';
import {
  usePatientInfo,
  formatPatientSummary
} from '@/lib/supabase/patientInfo';
import {
  useClinicianPatientData,
  useSetSuggestionStatus,
  useRetireGoal,
  useReactivateGoal,
  type GoalOutcome
} from '@/lib/supabase/clinicianPatient';
import { formatLongDate } from '@/lib/dates';
import { nrsToGas, injectionSideLabel, type GuidanceMethod } from '@/lib/types';
import { GoalProgressView } from '@/components/clinician/GoalProgressView';
import { GoalGraphModal } from '@/components/clinician/GoalGraphModal';
import { ExportModal } from '@/components/clinician/ExportModal';
import { NewCycleDialog } from '@/components/clinician/NewCycleDialog';
import {
  PatientActionRow,
  type PatientActionId
} from '@/components/clinician/PatientActionRow';
import { AccountMenu } from '@/components/layout/AccountMenu';
import {
  SkeletonBlock,
  SkeletonScreen
} from '@/components/feedback/Skeleton';
import { useModalA11y } from '@/lib/useModalA11y';
import { useWideLayout } from '@/lib/useWideLayout';
import { PageHelpButton } from '@/components/feedback/PageHelpButton';
import { buildEhrExport } from '@/lib/ehrExport';
import { useToast } from '@/components/feedback/Toast';
import { useSetPhysioGoalSuggestionStatus } from '@/lib/supabase/physioGoalSuggestion';
import { useSetPhysioMuscleSuggestionStatus } from '@/lib/supabase/physioMuscleSuggestion';

export default function ClinicianPatientPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('clinician.patient');
  const tSession = useTranslations('clinician.session');
  const tInfo = useTranslations('patientInfo');
  const tEt = useTranslations('etiology');
  const tSide = useTranslations('side');
  const tAmb = useTranslations('ambulation');
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
  // Patient clinical background — called at top level (not after the
  // loading-branch early return) to keep hook ordering stable across
  // renders. Hook itself is `enabled` only when patientId is known.
  const patientInfo = usePatientInfo(sessionQuery.data?.patientId ?? null);

  const endSession = useEndClinicianSession();
  const touchSession = useTouchClinicianSession();
  const setStatus = useSetSuggestionStatus();
  const retireGoal = useRetireGoal();
  const reactivateGoal = useReactivateGoal();
  const toast = useToast();
  const wide = useWideLayout();
  // Width / layout classes gated on the user's layout preference.
  // When wide, the header + main expand at lg and the goals render
  // in a 2-column grid; when compact, everything stays single-column
  // even on a large screen. The clinician patient page is mostly
  // review (goals, check-ins), so it uses the mid width (720px), not
  // the full wide spread — that's reserved for the treatment page.
  const headerWidthClass = wide
    ? 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 py-3 lg:max-w-[var(--max-w-page-mid)]'
    : 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 py-3';
  // Flex variant of the header width, for the skeleton header which
  // lays its placeholders out in a row.
  const flexHeaderWidthClass = wide
    ? 'mx-auto flex max-w-[var(--max-w-page-narrow)] items-center justify-between px-5 py-4 lg:max-w-[var(--max-w-page-mid)]'
    : 'mx-auto flex max-w-[var(--max-w-page-narrow)] items-center justify-between px-5 py-4';
  const mainWidthClass = wide
    ? 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 pb-16 pt-6 lg:max-w-[var(--max-w-page-mid)]'
    : 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 pb-16 pt-6';
  // The whole page is now capped at the mid width, so pre-goals
  // content and the plan section no longer need their own inner
  // width caps — the page width handles it.
  const preGoalsWidthClass = '';
  // Goals list: 2-column grid at lg when wide (two cards within the
  // 720px page, ~350px each); plain stacked list when compact.
  const goalsListClass = wide
    ? 'mt-3 space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0'
    : 'mt-3 space-y-3';
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [enlargedGoalId, setEnlargedGoalId] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showNewCycle, setShowNewCycle] = useState(false);
  // Which inline action panel is open under the action row, if any.
  // History and export are not panels — they navigate / open a modal.
  const [openPanel, setOpenPanel] = useState<'suggestions' | 'physio' | null>(
    null
  );
  // True once the physician has deliberately ended the session. While
  // this is set, the "no session → timeout" guard stands down: ending
  // the session naturally makes sessionQuery.data go null, and without
  // this flag that guard would fire its OWN redirect (with a spurious
  // ?timeout=1) racing the deliberate one in onEndSession — causing a
  // redirect stutter and a wrong "session timed out" message.
  const endingSessionRef = useRef(false);
  // The goal the physician is about to archive — drives the
  // confirmation dialog. Holds { id, text } or null when none pending.
  const [goalToArchive, setGoalToArchive] = useState<{
    id: string;
    text: string;
  } | null>(null);

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

  // No session → back to unlock screen, with a "?timeout=1" hint.
  //
  // This must only fire on a SETTLED, CONFIRMED "no session" — never on
  // a transient null while the session query is still loading or
  // refetching. React Query's `isLoading` is true only on the first
  // ever fetch, so it does NOT cover the 30s background refetches;
  // relying on it let a refetch-in-flight look "settled" and bounce the
  // physician out, which — paired with the unlock page's mirror
  // redirect — produced a redirect loop.
  //
  // The correct signal: status === 'success' (the query has completed
  // at least once) AND data === null (it definitively found no active
  // session). During a refetch, status stays 'success' and data keeps
  // its last value, so no false negative slips through.
  //
  // Also stands down while the physician is deliberately ending the
  // session (endingSessionRef) — onEndSession does its own navigation.
  useEffect(() => {
    if (endingSessionRef.current) return;
    if (sessionQuery.status === 'success' && sessionQuery.data === null) {
      router.replace(
        (locale === 'en' ? '/clinician' : `/${locale}/clinician`) +
          '?timeout=1'
      );
    }
  }, [sessionQuery.status, sessionQuery.data, router, locale]);

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
        {/* Header bar — matches real header height */}
        <header className="border-b border-stone/70 bg-cream-soft/50">
          <div className={flexHeaderWidthClass}>
            <SkeletonBlock width="w-16" height="h-4" />
            <SkeletonBlock width="w-8" height="h-8" shape="rounded-full" />
          </div>
        </header>
        <main className={mainWidthClass}>
          <SkeletonScreen label="Loading patient">
            {/* Patient name heading */}
            <SkeletonBlock width="w-3/4" height="h-8" />
            <SkeletonBlock width="w-1/2" height="h-4" className="mt-2" />

            {/* Active goals title + cards */}
            <div className="mt-10">
              <SkeletonBlock width="w-1/3" height="h-6" />
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="mt-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5"
                >
                  <SkeletonBlock width="w-4/5" height="h-5" />
                  {/* Pretend chart area */}
                  <SkeletonBlock
                    width="w-full"
                    height="h-32"
                    className="mt-4"
                  />
                </div>
              ))}
            </div>
          </SkeletonScreen>
        </main>
      </div>
    );
  }

  const {
    patient,
    cycle,
    suggestions,
    activeGoals,
    archivedGoals,
    checkins,
    treatment,
    physioAssessments,
    physioGoalSuggestions,
    physioMuscleSuggestions
  } = patientData.data;

  // Quiet at-a-glance summary line in the header. Just a derived string
  // — not a hook, safe after the early return.
  const patientSummary = formatPatientSummary(patientInfo.data ?? null, {
    ageYears: (age) => tInfo('ageYears', { age }),
    etiology: (k) => tEt(k),
    side: (k) => tSide(k),
    ambulation: (k) => tAmb(k)
  });

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
      submitterLabel?: 'self' | 'caregiver';
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
            comment: c.comment ?? undefined,
            submitterLabel: c.submitterLabel
          }
        ];
      })
      .sort((a, b) => a.weekNumber - b.weekNumber);
    ratingsByGoal.set(goal.id, perWeek);
  }

  // Build per-goal physiotherapist ratings. Physio assessments happen
  // on arbitrary dates; we snap each to the nearest weekly check-in
  // week so it can be drawn on the same week-numbered axis. The snap
  // is: weeksSinceStart = round(daysSinceCycleStart / 7), clamped to
  // at least week 1. NRS is converted to GAS with the goal's own cut
  // points, the same mapping the patient's ratings use, so physio and
  // patient points share the chart's GAS y-axis.
  const cycleStartMs = new Date(cycle.startDate).getTime();
  const physioRatingsByGoal = new Map<
    string,
    {
      weekNumber: number;
      nrs: number;
      value: -2 | -1 | 0 | 1 | 2;
      note: string | null;
    }[]
  >();
  for (const goal of activeGoals) {
    const points = physioAssessments
      .flatMap((a) => {
        const r = a.ratings.find((x) => x.approvedGoalId === goal.id);
        if (!r) return [];
        const days =
          (new Date(a.assessmentDate).getTime() - cycleStartMs) /
          (24 * 60 * 60 * 1000);
        const snappedWeek = Math.max(1, Math.round(days / 7));
        return [
          {
            weekNumber: snappedWeek,
            nrs: r.nrsValue,
            // NRS goals derive GAS from the goal's cut points. GAS goals
            // are rated as a level directly, so the recorded value is
            // already the GAS level. (GAS rating capture itself ships in
            // the check-in slice; this guard keeps the view correct and
            // the build sound in the meantime.)
            value:
              goal.kind === 'nrs' && goal.nrs
                ? nrsToGas(r.nrsValue, {
                    question: goal.nrs.question,
                    direction: goal.nrs.direction,
                    cutLowLow: goal.nrs.cutLowLow,
                    cutLow: goal.nrs.cutLow,
                    cutZero: goal.nrs.cutZero,
                    cutHigh: goal.nrs.cutHigh
                  })
                : ((r.nrsValue as unknown) as -2 | -1 | 0 | 1 | 2),
            note: a.note
          }
        ];
      })
      .sort((a, b) => a.weekNumber - b.weekNumber);
    physioRatingsByGoal.set(goal.id, points);
  }

  const onEndSession = async () => {
    // Mark the deliberate end FIRST, so the patient-page timeout guard
    // stands down before endSession makes sessionQuery.data go null.
    endingSessionRef.current = true;
    try {
      await endSession.mutateAsync();
    } catch {
      // If ending failed, the session is still live — clear the flag
      // so the guard works normally again, and let the user retry.
      endingSessionRef.current = false;
      toast.error(tSession('endSessionError'));
      return;
    }
    // Navigate with an explicit "ended=1" marker. The unlock page uses
    // this to know the session was ended ON PURPOSE, and so must NOT
    // show the "timed out after inactivity" message — even if a stray
    // timeout-guard redirect also races here, the unlock page checks
    // for this marker and it wins.
    router.replace(
      (locale === 'en' ? '/clinician' : `/${locale}/clinician`) + '?ended=1'
    );
  };

  // Retire the goal currently held in goalToArchive with the chosen
  // outcome, then close the dialog. History is preserved; the goal
  // leaves the patient's future check-ins. The query invalidation
  // refreshes the goal list.
  const onRetireGoal = async (outcome: GoalOutcome) => {
    if (!goalToArchive) return;
    try {
      await retireGoal.mutateAsync({ goalId: goalToArchive.id, outcome });
      toast.success(t('archiveToast'));
    } catch {
      toast.error(t('archiveError'));
    } finally {
      setGoalToArchive(null);
    }
  };

  // Reactivate a goal retired by mistake — returns it to the patient's
  // check-ins. No confirm dialog: it's a low-stakes, easily-reversed
  // action (the goal can simply be retired again).
  const onReactivateGoal = async (goalId: string) => {
    touch();
    try {
      await reactivateGoal.mutateAsync({ goalId });
      toast.success(t('reactivateToast'));
    } catch {
      toast.error(t('reactivateError'));
    }
  };

  // Touch session on any meaningful click. Safe to call unconditionally
  // — the RPC silently no-ops for non-clinicians.
  const touch = () => touchSession.mutate();

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className={headerWidthClass}>
          {/* Single row: the patient (name + info link) on the left
              takes the available width and truncates; the controls
              (end session, help, account) sit on the right. End
              session is an icon on mobile to keep the row compact. The
              clinical summary sits on its own line beneath the name. */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                router.push(
                  locale === 'en'
                    ? '/patient-info'
                    : `/${locale}/patient-info`
                )
              }
              aria-label={tInfo('openInfo', { name: patient.displayName })}
              className="group flex min-w-0 flex-1 items-center gap-1 text-left"
            >
              <span className="truncate font-display text-[20px] leading-tight text-ink group-hover:text-sage-deep">
                {patient.displayName}
              </span>
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted group-hover:text-sage-deep"
                aria-hidden
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="11" x2="12" y2="16" />
                  <circle cx="12" cy="8" r="0.6" fill="currentColor" />
                </svg>
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmEnd(true)}
                aria-label={tSession('endSession')}
                title={tSession('endSession')}
                className="flex h-11 w-11 items-center justify-center gap-1.5 rounded-full border border-stone bg-cream text-[13px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink sm:w-auto sm:rounded-[var(--radius-button)] sm:px-3"
              >
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
                  className="shrink-0"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span className="hidden sm:inline">
                  {tSession('endSession')}
                </span>
              </button>
              <PageHelpButton pageKey="clinicianPatient" />
              <AccountMenu />
            </div>
          </div>
          {patientSummary && (
            <div className="mt-1 truncate text-[12px] text-ink-muted">
              {patientSummary}
            </div>
          )}
        </div>
      </header>

      <main className={mainWidthClass}>
        {/* Pre-goals content (cycle context, action row, panels,
            primary action) constrained to readable form width on
            desktop. Otherwise the action row buttons + panels would
            sparse-stretch across the full 1080px page width. */}
        <div className={preGoalsWidthClass}>
        <div className="eyebrow">
          {t('cycleContext', {
            week: weekNumber
          })}
        </div>
        <p className="mt-1 text-[15px] text-ink-soft">
          {t('treatmentDate', {
            date: formatLongDate(cycle.startDate, locale)
          })}
        </p>

        {/* Action row — always-visible entry points with live counts.
            Suggestions and therapist input open inline panels below;
            history navigates; export opens the modal. */}
        <PatientActionRow
          suggestionCount={suggestions.length}
          physioCount={
            physioGoalSuggestions.length + physioMuscleSuggestions.length
          }
          openPanel={openPanel}
          labels={{
            suggestions: t('actionSuggestions'),
            physio: t('actionPhysio'),
            history: t('actionHistory'),
            export: t('actionExport')
          }}
          shortLabels={{
            suggestions: t('actionShortSuggestions'),
            physio: t('actionShortPhysio'),
            history: t('actionShortHistory'),
            export: t('actionShortExport')
          }}
          onSelect={(id: PatientActionId) => {
            touch();
            if (id === 'history') {
              router.push(
                locale === 'en'
                  ? '/clinician/history'
                  : `/${locale}/clinician/history`
              );
            } else if (id === 'export') {
              setShowExport(true);
            } else {
              // Toggle the inline panel (suggestions | physio).
              setOpenPanel((cur) => (cur === id ? null : id));
            }
          }}
        />

        {/* Patient suggestions panel — opens from the action row. */}
        {openPanel === 'suggestions' && (
          <section className="mt-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
            <h2 className="font-display text-[18px] leading-tight text-ink">
              {t('patientSuggestionsHeading')}
            </h2>
            <div className="mt-3">
          {suggestions.length === 0 ? (
            <p className="text-[14px] text-ink-muted">
                {t('suggestionsEmpty')}
              </p>
            ) : (
              <ul className="space-y-3">
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
                      className="mt-3 flex h-10 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-on-accent hover:bg-ink-soft"
                    >
                      {t('review')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            </div>
          </section>
        )}

        {/* Therapist input panel — opens from the action row. */}
        {openPanel === 'physio' && (
          <section className="mt-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
            <h2 className="font-display text-[18px] leading-tight text-ink">
              {t('physioInputHeading')}
            </h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              {t('physioInputSubtitle')}
            </p>
            <div className="mt-3">
          {physioGoalSuggestions.length === 0 &&
          physioMuscleSuggestions.length === 0 ? (
            <p className="text-[14px] text-ink-muted">
              {t('physioInputNone')}
            </p>
          ) : (
            <>
              {/* Goal suggestions from the therapist. */}
              <div>
                <h3 className="text-[15px] font-semibold text-ink-soft">
                  {t('physioSuggestedGoals')}
                </h3>
                {physioGoalSuggestions.length === 0 ? (
                  <p className="mt-2 text-[14px] text-ink-muted">
                    {t('physioGoalsEmpty')}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {physioGoalSuggestions.map((s) => (
                      <li
                        key={s.id}
                        className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
                      >
                        <p className="font-display text-[16px] leading-snug text-ink">
                          {s.suggestedGoal}
                        </p>
                        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
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

              {/* Muscles flagged by the therapist. */}
              <div className="mt-6">
                <h3 className="text-[15px] font-semibold text-ink-soft">
                  {t('physioFlaggedMuscles')}
                </h3>
                {physioMuscleSuggestions.length === 0 ? (
                  <p className="mt-2 text-[14px] text-ink-muted">
                    {t('physioMusclesEmpty')}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {physioMuscleSuggestions.map((s) => {
                      const linkedGoal = activeGoals.find(
                        (g) => g.id === s.relatedGoalId
                      );
                      const sideLabel = injectionSideLabel(s.side);
                      return (
                        <li
                          key={s.id}
                          className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
                        >
                          <p className="font-display text-[16px] leading-snug text-ink">
                            {s.muscle}{' '}
                            <span className="text-ink-muted">
                              · {sideLabel}
                            </span>
                          </p>
                          <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                            <span className="text-ink-muted">
                              {t('rationaleLabel')}:{' '}
                            </span>
                            {s.rationale}
                          </p>
                          {linkedGoal && (
                            <p className="mt-2 text-[13px] text-ink-muted">
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
          </section>
        )}


        {/* Start a new treatment cycle — the primary action of a
            physician's visit: every injection appointment begins by
            opening a new cycle. So it sits front and centre, directly
            under the cycle context, not buried. The NewCycleDialog
            still confirms before doing anything, which is the
            safeguard against an accidental tap. */}
        <button
          type="button"
          onClick={() => {
            touch();
            setShowNewCycle(true);
          }}
          className="mt-5 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 hover:bg-ink-soft"
        >
          <span className="text-[15px] font-semibold text-on-accent">
            {t('startNewCycle')}
          </span>
        </button>
        </div>

        {/* Active goals with progress visualisation */}
        <section className="mt-10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-[20px] leading-tight text-ink">
              {t('activeGoalsTitle')}
            </h2>
            {/* Record a goal the patient voiced in clinic. The goal
                still originates from the patient; the physician is the
                scribe — see create_goal_for_patient. */}
            <button
              type="button"
              onClick={() =>
                router.push(
                  locale === 'en'
                    ? `/clinician/new-goal?patient=${patient.id}`
                    : `/${locale}/clinician/new-goal?patient=${patient.id}`
                )
              }
              className="shrink-0 rounded-[var(--radius-button)] border border-sage/50 bg-cream-soft px-3 py-2 text-[14px] font-semibold text-sage-deep hover:bg-sage-soft"
            >
              + Record a goal
            </button>
          </div>
          {activeGoals.length === 0 ? (
            <p className="mt-3 text-[14px] text-ink-muted">
              {t('activeGoalsEmpty')}
            </p>
          ) : (
            <ul className={goalsListClass}>
              {activeGoals.map((g) => (
                <li key={g.id}>
                  <GoalProgressView
                    goalText={g.patientFacingText}
                    currentWeek={weekNumber}
                    ratings={ratingsByGoal.get(g.id) ?? []}
                    physioRatings={physioRatingsByGoal.get(g.id) ?? []}
                    onExpand={() => setEnlargedGoalId(g.id)}
                  />
                  {/* Retire action — retires a goal (achieved /
                      partial / no longer suitable). History is kept;
                      the goal leaves the patient's future check-ins. */}
                  <div className="mt-1.5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        touch();
                        setGoalToArchive({
                          id: g.id,
                          text: g.patientFacingText
                        });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink"
                    >
                      {/* check-in-out / retire glyph */}
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      {t('retireGoal')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Earlier goals — retired this cycle, with how each ended.
            Shows the climb (achieved goals) and course-corrections
            (reframed / no longer suitable) without re-asking the
            patient about them. Only rendered when there are archived
            goals. Their check-in history is preserved in the export. */}
        {archivedGoals.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-[20px] leading-tight text-ink">
              {t('earlierGoalsTitle')}
            </h2>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
              {t('earlierGoalsBody')}
            </p>
            <ul className="mt-4 space-y-2">
              {archivedGoals.map((g) => (
                <li
                  key={g.id}
                  className="flex items-start gap-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft px-4 py-3"
                >
                  <GoalOutcomeBadge outcome={g.outcome} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-snug text-ink">
                      {g.patientFacingText}
                    </span>
                    {g.smartText && (
                      <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">
                        {g.smartText}
                      </span>
                    )}
                  </span>
                  {/* Reactivate — for a goal retired by mistake. Returns
                      it to the patient's active check-ins. */}
                  <button
                    type="button"
                    onClick={() => onReactivateGoal(g.id)}
                    disabled={reactivateGoal.isPending}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink disabled:opacity-60"
                  >
                    {/* restore / undo glyph */}
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M3 7v6h6" />
                      <path d="M3.5 13a9 9 0 1 0 2.3-9.3L3 7" />
                    </svg>
                    {t('reactivateGoal')}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Patient comments are now reachable from the chart — tap any
            dot showing a speech-bubble icon to see the comment in the
            caption below the chart. */}
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
            goals: [...activeGoals, ...archivedGoals].map((g) => ({
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
          onClose={() => setShowNewCycle(false)}
        />
      )}

      {confirmEnd && (
        <EndSessionConfirmDialog
          keepLabel={tSession('endSessionConfirmKeep')}
          endLabel={tSession('endSessionConfirmEnd')}
          title={tSession('endSessionConfirm')}
          onKeep={() => setConfirmEnd(false)}
          onEnd={onEndSession}
          endDisabled={endSession.isPending}
        />
      )}

      {goalToArchive && (
        <ArchiveGoalConfirmDialog
          goalText={goalToArchive.text}
          onCancel={() => setGoalToArchive(null)}
          onRetire={onRetireGoal}
          retireDisabled={retireGoal.isPending}
        />
      )}
      {enlargedGoalId &&
        (() => {
          const g = activeGoals.find((x) => x.id === enlargedGoalId);
          if (!g) return null;
          return (
            <GoalGraphModal
              goalText={g.patientFacingText}
              currentWeek={weekNumber}
              ratings={ratingsByGoal.get(g.id) ?? []}
              physioRatings={physioRatingsByGoal.get(g.id) ?? []}
              closeLabel={tSession('done')}
              onClose={() => setEnlargedGoalId(null)}
            />
          );
        })()}
    </div>
  );
}

/**
 * Small colour-coded badge for a retired goal's outcome, matching the
 * retire dialog's language: achieved (sage), partially achieved
 * (amber), no longer suitable (neutral). Falls back to a plain
 * "retired" chip if the outcome is null (older archived goals from
 * before outcomes were captured).
 */
function GoalOutcomeBadge({ outcome }: { outcome: GoalOutcome | null }) {
  const t = useTranslations('clinician.patient');
  const map: Record<
    GoalOutcome,
    { label: string; className: string }
  > = {
    achieved: {
      label: t('retireAchieved'),
      className: 'bg-sage-soft text-sage-deep'
    },
    partial: {
      label: t('retirePartial'),
      className: 'bg-amber-soft text-amber-deep'
    },
    noLongerSuitable: {
      label: t('retireNoLongerSuitable'),
      className: 'bg-stone text-ink-soft'
    }
  };
  const item = outcome
    ? map[outcome]
    : { label: t('outcomeUnknown'), className: 'bg-stone text-ink-soft' };
  return (
    <span
      className={`mt-0.5 inline-block shrink-0 rounded-[var(--radius-button)] px-2.5 py-1 text-[12px] font-semibold ${item.className}`}
    >
      {item.label}
    </span>
  );
}

/**
 * Confirmation before retiring a goal, capturing *how* it ended.
 * Goals are living — reviewed and adjusted at each visit — so retiring
 * one is a clinical event with a meaningful outcome, not a flat
 * "archive". The physician picks: achieved, partially achieved, or no
 * longer suitable. All three retire the goal (it leaves the patient's
 * check-ins, history preserved); they differ only in the recorded
 * outcome, which feeds the per-cycle goal history. A keep-working
 * escape leaves the goal active.
 */
function ArchiveGoalConfirmDialog({
  goalText,
  onCancel,
  onRetire,
  retireDisabled
}: {
  goalText: string;
  onCancel: () => void;
  onRetire: (outcome: GoalOutcome) => void;
  retireDisabled: boolean;
}) {
  const containerRef = useModalA11y(onCancel);
  const t = useTranslations('clinician.patient');
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-goal-title"
        className="w-full max-w-[400px] rounded-[var(--radius-card)] border border-stone bg-cream p-6 shadow-xl"
      >
        <h2
          id="archive-goal-title"
          className="font-display text-[20px] text-ink"
        >
          {t('retireConfirmTitle')}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          &ldquo;{goalText}&rdquo;
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
          {t('retireConfirmBody')}
        </p>

        <p className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
          {t('retireOutcomePrompt')}
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {/* Achieved — the positive outcome, styled as the primary. */}
          <button
            type="button"
            onClick={() => onRetire('achieved')}
            disabled={retireDisabled}
            className="flex flex-col items-start rounded-[var(--radius-button)] bg-sage-deep px-4 py-3 text-left hover:bg-ink-soft disabled:opacity-60"
          >
            <span className="text-[15px] font-semibold text-on-accent">
              {t('retireAchieved')}
            </span>
            <span className="text-[12px] leading-snug text-on-accent/85">
              {t('retireAchievedHint')}
            </span>
          </button>
          {/* Partially achieved. */}
          <button
            type="button"
            onClick={() => onRetire('partial')}
            disabled={retireDisabled}
            className="flex flex-col items-start rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-3 text-left hover:bg-stone-soft disabled:opacity-60"
          >
            <span className="text-[15px] font-semibold text-ink">
              {t('retirePartial')}
            </span>
            <span className="text-[12px] leading-snug text-ink-muted">
              {t('retirePartialHint')}
            </span>
          </button>
          {/* No longer suitable / reframed / dropped. */}
          <button
            type="button"
            onClick={() => onRetire('noLongerSuitable')}
            disabled={retireDisabled}
            className="flex flex-col items-start rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-3 text-left hover:bg-stone-soft disabled:opacity-60"
          >
            <span className="text-[15px] font-semibold text-ink">
              {t('retireNoLongerSuitable')}
            </span>
            <span className="text-[12px] leading-snug text-ink-muted">
              {t('retireNoLongerSuitableHint')}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
        >
          {t('archiveConfirmKeep')}
        </button>
      </div>
    </div>
  );
}

function EndSessionConfirmDialog({
  title,
  keepLabel,
  endLabel,
  onKeep,
  onEnd,
  endDisabled
}: {
  title: string;
  keepLabel: string;
  endLabel: string;
  onKeep: () => void;
  onEnd: () => void;
  endDisabled: boolean;
}) {
  const containerRef = useModalA11y(onKeep);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-session-title"
        className="w-full max-w-[400px] rounded-[var(--radius-card)] border border-stone bg-cream p-6 shadow-xl"
      >
        <h2 id="end-session-title" className="font-display text-[20px] text-ink">
          {title}
        </h2>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onKeep}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft"
          >
            {keepLabel}
          </button>
          <button
            type="button"
            onClick={onEnd}
            disabled={endDisabled}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft disabled:opacity-60"
          >
            {endLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Action row for a physiotherapist goal suggestion. While the
 * suggestion is awaiting review, shows Accept / Dismiss buttons. Once
 * acted on, shows the final status instead. "Accept" here records the
 * physician's intent to take the goal forward — the actual goal
 * approval still happens via the normal goal-approval flow.
 */
function PhysioGoalSuggestionActions({
  suggestionId,
  status
}: {
  suggestionId: string;
  status: string;
}) {
  const setStatus = useSetPhysioGoalSuggestionStatus();
  const toast = useToast();

  if (status !== 'needsReview') {
    return (
      <p className="mt-3 text-[13px] uppercase tracking-wider text-ink-muted">
        {status === 'accepted' ? 'Considered' : 'Dismissed'}
      </p>
    );
  }

  const act = async (next: 'accepted' | 'dismissed') => {
    try {
      await setStatus.mutateAsync({ suggestionId, status: next });
      toast.success(
        next === 'accepted'
          ? 'Marked considered'
          : 'Suggestion dismissed'
      );
    } catch {
      toast.error('Could not update the suggestion.');
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
        Mark considered
      </button>
      <button
        type="button"
        onClick={() => act('dismissed')}
        disabled={setStatus.isPending}
        className="flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream px-4 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft disabled:opacity-50"
      >
        Dismiss
      </button>
    </div>
  );
}

/**
 * Action row for a physiotherapist muscle suggestion. "Mark considered"
 * records that the physician has factored this muscle into injection
 * planning; "Dismiss" marks it not relevant.
 */
function PhysioMuscleSuggestionActions({
  suggestionId,
  status
}: {
  suggestionId: string;
  status: string;
}) {
  const setStatus = useSetPhysioMuscleSuggestionStatus();
  const toast = useToast();

  if (status !== 'needsReview') {
    return (
      <p className="mt-3 text-[13px] uppercase tracking-wider text-ink-muted">
        {status === 'reviewed' ? 'Considered' : 'Dismissed'}
      </p>
    );
  }

  const act = async (next: 'reviewed' | 'dismissed') => {
    try {
      await setStatus.mutateAsync({ suggestionId, status: next });
      toast.success(
        next === 'reviewed' ? 'Marked considered' : 'Suggestion dismissed'
      );
    } catch {
      toast.error('Could not update the suggestion.');
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
        Mark considered
      </button>
      <button
        type="button"
        onClick={() => act('dismissed')}
        disabled={setStatus.isPending}
        className="flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream px-4 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft disabled:opacity-50"
      >
        Dismiss
      </button>
    </div>
  );
}
