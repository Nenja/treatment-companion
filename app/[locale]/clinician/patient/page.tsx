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
  useClinicianPatientData,
  useSetSuggestionStatus,
  useSetMuscleSharing,
  useArchiveGoal
} from '@/lib/supabase/clinicianPatient';
import { formatLongDate } from '@/lib/dates';
import { nrsToGas, injectionSideLabel, type GuidanceMethod } from '@/lib/types';
import { GoalProgressView } from '@/components/clinician/GoalProgressView';
import { ExportModal } from '@/components/clinician/ExportModal';
import { NewCycleDialog } from '@/components/clinician/NewCycleDialog';
import { CollapsibleSection } from '@/components/clinician/CollapsibleSection';
import { AccountMenu } from '@/components/layout/AccountMenu';
import {
  SkeletonBlock,
  SkeletonParagraph,
  SkeletonScreen
} from '@/components/feedback/Skeleton';
import { useModalA11y } from '@/lib/useModalA11y';
import { buildEhrExport } from '@/lib/ehrExport';
import { useToast } from '@/components/feedback/Toast';
import { useSetPhysioGoalSuggestionStatus } from '@/lib/supabase/physioGoalSuggestion';
import { useSetPhysioMuscleSuggestionStatus } from '@/lib/supabase/physioMuscleSuggestion';

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
  const setMuscleSharing = useSetMuscleSharing();
  const archiveGoal = useArchiveGoal();
  const toast = useToast();

  const [confirmEnd, setConfirmEnd] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showNewCycle, setShowNewCycle] = useState(false);
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
          <div className="mx-auto flex max-w-[480px] items-center justify-between px-5 py-4">
            <SkeletonBlock width="w-16" height="h-4" />
            <SkeletonBlock width="w-8" height="h-8" shape="rounded-full" />
          </div>
        </header>
        <main className="mx-auto max-w-[480px] px-5 pb-16 pt-6">
          <SkeletonScreen label="Loading patient">
            {/* Patient name heading */}
            <SkeletonBlock width="w-3/4" height="h-8" />
            <SkeletonBlock width="w-1/2" height="h-4" className="mt-2" />

            {/* Treatment record card */}
            <div className="mt-8 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5">
              <SkeletonBlock width="w-1/3" height="h-5" />
              <SkeletonParagraph lines={3} className="mt-3" />
            </div>

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
            value: nrsToGas(r.nrsValue, {
              question: goal.nrs.question,
              direction: goal.nrs.direction,
              cutLowLow: goal.nrs.cutLowLow,
              cutLow: goal.nrs.cutLow,
              cutZero: goal.nrs.cutZero,
              cutHigh: goal.nrs.cutHigh
            }),
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

  // Archive the goal currently held in goalToArchive, then close the
  // dialog. History is preserved; the goal leaves the patient's future
  // check-ins. The query invalidation refreshes the goal list.
  const onArchiveGoal = async () => {
    if (!goalToArchive) return;
    try {
      await archiveGoal.mutateAsync({ goalId: goalToArchive.id });
      toast.success(t('archiveToast'));
    } catch {
      toast.error(t('archiveError'));
    } finally {
      setGoalToArchive(null);
    }
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
              className="text-[14px] font-semibold text-ink-soft hover:text-ink"
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

        {/* Needs-attention summary. The clinician patient page shows a
            lot; this lifts the one genuinely actionable thing —
            patient goal suggestions awaiting review — to the top so a
            physician sees it immediately instead of scrolling to find
            it. Physiotherapist input is "consider", not "act", so it
            is deliberately not counted here. Hidden when nothing is
            pending. */}
        {suggestions.length > 0 && (
          <a
            href="#patient-suggestions"
            className="mt-5 flex items-center gap-3 rounded-[var(--radius-card)] border border-sage/50 bg-sage-soft px-4 py-3 hover:bg-sage-soft/70"
          >
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-deep text-[16px] font-bold text-on-accent"
            >
              {suggestions.length}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-ink">
                {suggestions.length === 1
                  ? '1 goal suggestion to review'
                  : `${suggestions.length} goal suggestions to review`}
              </span>
              <span className="block text-[13px] text-ink-soft">
                From this patient — tap to jump to them.
              </span>
            </span>
          </a>
        )}

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
                  <p className="mt-0.5 text-[14px] text-ink-soft">
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
                  className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[14px] font-semibold text-sage-deep hover:bg-stone-soft"
                >
                  Edit
                </button>
              </div>
              <ul className="mt-3 space-y-1.5 text-[14px] text-ink-soft">
                {treatment.injections.map((inj) => (
                  <li key={inj.id}>
                    <span>
                      {inj.muscle} · {injectionSideLabel(inj.side)} ·{' '}
                      {inj.doseUnits} units
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
                <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-soft">
                  <span className="text-ink-muted">Notes: </span>
                  {treatment.notes}
                </p>
              )}

              {/* Muscle-sharing toggle — controls whether the
                  physiotherapist sees the injected muscles for this
                  patient. */}
              <div className="mt-4 flex items-start justify-between gap-3 border-t border-stone/70 pt-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink">
                    Share treated muscles with physiotherapist
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-muted">
                    {patient.shareMusclesWithPhysio
                      ? 'The physiotherapist can see which muscles were injected.'
                      : 'The physiotherapist cannot see the injected muscles.'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={patient.shareMusclesWithPhysio}
                  disabled={setMuscleSharing.isPending}
                  onClick={() => {
                    touch();
                    setMuscleSharing.mutate(
                      {
                        patientId: patient.id,
                        share: !patient.shareMusclesWithPhysio
                      },
                      {
                        onError: () =>
                          toast.error(
                            'Could not change the setting. Please try again.'
                          )
                      }
                    );
                  }}
                  className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                    patient.shareMusclesWithPhysio
                      ? 'bg-sage-deep'
                      : 'bg-stone'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-cream-soft transition-all ${
                      patient.shareMusclesWithPhysio
                        ? 'left-6'
                        : 'left-1'
                    }`}
                  />
                </button>
              </div>
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
                className="mt-3 flex h-10 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-on-accent hover:bg-ink-soft"
              >
                Record treatment
              </button>
            </>
          )}
        </section>

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
            <ul className="mt-3 space-y-3">
              {activeGoals.map((g) => (
                <li key={g.id}>
                  <GoalProgressView
                    goalText={g.patientFacingText}
                    currentWeek={weekNumber}
                    ratings={ratingsByGoal.get(g.id) ?? []}
                    physioRatings={physioRatingsByGoal.get(g.id) ?? []}
                  />
                  {/* Archive action — retires a goal that is no longer
                      relevant. History is kept; the goal leaves the
                      patient's future check-ins. */}
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
                      className="text-[13px] font-semibold text-ink-muted hover:text-ink-soft"
                    >
                      {t('archiveGoal')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Patient goal suggestions — collapsible. Starts open when
            there is anything awaiting review, so pending work is never
            hidden; the header count means it is noticed even closed. */}
        <div id="patient-suggestions">
          <CollapsibleSection
            title={t('patientSuggestionsHeading')}
            count={suggestions.length}
            defaultOpen={suggestions.length > 0}
          >
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
          </CollapsibleSection>
        </div>

        {/* Therapist input — goal suggestions and flagged muscles,
            grouped so a physician reads them as one "consider this"
            zone, distinct from the patient suggestions above which are
            "act on this". Collapsible; starts open when anything is
            still awaiting the physician (status 'needsReview'). */}
        <CollapsibleSection
          title={t('physioInputHeading')}
          subtitle={t('physioInputSubtitle')}
          count={
            physioGoalSuggestions.length + physioMuscleSuggestions.length
          }
          defaultOpen={
            physioGoalSuggestions.some((s) => s.status === 'needsReview') ||
            physioMuscleSuggestions.some((s) => s.status === 'needsReview')
          }
        >
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
        </CollapsibleSection>

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

        {/* Start a new treatment cycle — a rare, significant action, so
            it sits apart at the very bottom (not under the treatment
            card where a mis-tap is easy) and is visually quiet. The
            NewCycleDialog confirms before doing anything. */}
        <div className="mt-12 border-t border-stone/70 pt-5">
          <button
            type="button"
            onClick={() => {
              touch();
              setShowNewCycle(true);
            }}
            className="text-[14px] font-semibold text-ink-muted hover:text-ink-soft"
          >
            Start a new treatment cycle
          </button>
        </div>
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
          patientId={patient.id}
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
          onArchive={onArchiveGoal}
          archiveDisabled={archiveGoal.isPending}
        />
      )}
    </div>
  );
}

/**
 * Confirmation before archiving a goal. Archiving is reversible in
 * principle but changes the patient's check-in, so it is confirmed
 * rather than fired on a single tap. The dialog states plainly what
 * archiving does and does not do.
 */
function ArchiveGoalConfirmDialog({
  goalText,
  onCancel,
  onArchive,
  archiveDisabled
}: {
  goalText: string;
  onCancel: () => void;
  onArchive: () => void;
  archiveDisabled: boolean;
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
          {t('archiveConfirmTitle')}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          &ldquo;{goalText}&rdquo;
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
          {t('archiveConfirmBody')}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onArchive}
            disabled={archiveDisabled}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-60"
          >
            {t('archiveGoal')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {t('archiveConfirmKeep')}
          </button>
        </div>
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
