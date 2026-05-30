'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  useCurrentClinicianSession,
  useEndClinicianSession
} from '@/lib/supabase/clinicianSession';
import { usePhysioPatientData } from '@/lib/supabase/physioPatient';
import {
  usePatientInfo,
  formatPatientSummary
} from '@/lib/supabase/patientInfo';
import { formatLongDate } from '@/lib/dates';
import { useWideLayout } from '@/lib/useWideLayout';
import { nrsToGas } from '@/lib/types';
import { GoalProgressView } from '@/components/clinician/GoalProgressView';
import {
  PhysioActionRow,
  type PhysioActionId
} from '@/components/physio/PhysioActionRow';
import { PhysioGoalSuggestionForm } from '@/components/physio/PhysioGoalSuggestionForm';
import { PhysioMuscleSuggestionForm } from '@/components/physio/PhysioMuscleSuggestionForm';
import { PhysioPlanSection } from '@/components/physio/PhysioPlanSection';
import { AccountMenu } from '@/components/layout/AccountMenu';
import {
  SkeletonBlock,
  SkeletonParagraph,
  SkeletonScreen
} from '@/components/feedback/Skeleton';
import { groupTreatedMuscles } from '@/lib/types';

/**
 * Physiotherapist patient view.
 *
 * SLICE 1 — placeholder. Shows the unlocked patient's name and their
 * active goals, read-only. This proves the unlock works end-to-end and
 * gives later slices a surface to build on:
 *   - Slice 2: progress reporting (NRS, parallel to patient self-report)
 *   - Slice 3: goal suggestions
 *   - Slice 4: muscle suggestions
 *
 * If the session has expired or there is none, redirect to /physio.
 */
export default function PhysioPatientPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('physio');
  const tInfo = useTranslations('patientInfo');
  const tEt = useTranslations('etiology');
  const tSide = useTranslations('side');
  const tAmb = useTranslations('ambulation');
  const { user, profile, loading: authLoading } = useAuth();
  const wide = useWideLayout();
  // Width + layout classes gated on the layout preference. The
  // therapist page is mixed-use (phone in clinic, desktop when
  // writing up), so it expands gracefully when wide and stays
  // single-column when compact or on a narrow screen.
  const headerWidthClass = wide
    ? 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 py-3 lg:max-w-[var(--max-w-page-mid)]'
    : 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 py-3';
  const mainWidthClass = wide
    ? 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 pb-16 pt-6 lg:max-w-[var(--max-w-page-mid)]'
    : 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 pb-16 pt-6';
  // Page is capped at the mid width, so the body no longer needs its
  // own inner cap — the page width handles it.
  const bodyColumnClass = '';
  // Goals list: 2-column grid at lg when wide; stacked when compact.
  const goalsListClass = wide
    ? 'mt-3 space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0'
    : 'mt-3 space-y-3';
  const sessionQuery = useCurrentClinicianSession(
    profile?.id ?? null,
    profile?.role
  );
  const patientData = usePhysioPatientData(
    profile?.id ?? null,
    profile?.role
  );
  // Patient clinical background — at top level, before any early
  // returns, so hook order stays stable. Hook is enabled only when the
  // patient id resolves from the session.
  const patientInfo = usePatientInfo(sessionQuery.data?.patientId ?? null);
  const endSession = useEndClinicianSession();

  // Which inline panel is open under the action row, if any. Only one
  // at a time. Progress reporting is NOT in this set — it's a primary
  // action that navigates to its own page (/physio/progress), like
  // the clinician's start-new-cycle button goes to /clinician/treatment.
  const [openPanel, setOpenPanel] = useState<PhysioActionId | null>(null);

  const unlockPath = locale === 'en' ? '/physio' : `/${locale}/physio`;

  // True once the therapist deliberately ends the session — see the
  // matching note on the physician patient page. Stops the "no
  // session" guard from racing onEndSession's own navigation.
  const endingSessionRef = useRef(false);

  // Auth gating.
  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) {
      router.replace(locale === 'en' ? '/login' : `/${locale}/login`);
      return;
    }
    if (profile.role !== 'physiotherapist') {
      router.replace(locale === 'en' ? '/' : `/${locale}`);
    }
  }, [authLoading, user, profile, router, locale]);

  // No active session → back to unlock. Stands down while the therapist
  // is deliberately ending the session, so onEndSession's navigation
  // is the only one that fires.
  useEffect(() => {
    if (endingSessionRef.current) return;
    if (sessionQuery.status === 'success' && sessionQuery.data === null) {
      router.replace(unlockPath);
    }
  }, [sessionQuery.status, sessionQuery.data, router, unlockPath]);

  const onEndSession = async () => {
    endingSessionRef.current = true;
    try {
      await endSession.mutateAsync();
    } catch {
      endingSessionRef.current = false;
      return;
    }
    router.replace(unlockPath);
  };

  if (
    authLoading ||
    !profile ||
    profile.role !== 'physiotherapist' ||
    sessionQuery.isLoading ||
    !sessionQuery.data
  ) {
    return <div className="min-h-dvh bg-cream" />;
  }

  // Per-goal patient ratings and therapist assessment points for the
  // progress charts. Both are keyed by goal id, both empty when there
  // is no cycle / no data yet. Same logic as the clinician page; kept
  // separate here rather than extracted because the two pages may
  // diverge later (e.g. therapists may want different overlays).
  const cycle = patientData.data?.cycle ?? null;
  const goals = patientData.data?.goals ?? [];
  const checkins = patientData.data?.checkins ?? [];
  const assessments = patientData.data?.assessments ?? [];

  const cycleStartMs = cycle ? new Date(cycle.startDate).getTime() : 0;
  const daysSinceStart = cycle
    ? Math.floor((Date.now() - cycleStartMs) / (24 * 60 * 60 * 1000))
    : 0;
  const weekNumber = cycle ? Math.max(1, Math.floor(daysSinceStart / 7) + 1) : 1;

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
  for (const goal of goals) {
    const perWeek = checkins
      .flatMap((c) => {
        const r = c.ratings.find((x) => x.approvedGoalId === goal.id);
        if (!r) return [];
        return [
          {
            weekNumber: c.weekNumber,
            value: r.ratingValue,
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

  const physioRatingsByGoal = new Map<
    string,
    {
      weekNumber: number;
      nrs: number;
      value: -2 | -1 | 0 | 1 | 2;
      note: string | null;
    }[]
  >();
  for (const goal of goals) {
    const points = assessments
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
              question: goal.nrsQuestion,
              direction: goal.nrsDirection,
              cutLowLow: goal.cutLowLow,
              cutLow: goal.cutLow,
              cutZero: goal.cutZero,
              cutHigh: goal.cutHigh
            }),
            note: a.note
          }
        ];
      })
      .sort((a, b) => a.weekNumber - b.weekNumber);
    physioRatingsByGoal.set(goal.id, points);
  }

  // Recent patient comments — last 14 days, only those with a
  // non-empty comment. Surfaced on the front page under "Since your
  // last visit" so the therapist sees the patient's own words before
  // doing anything. Sorted newest first.
  const fourteenDaysAgoMs = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const recentCommentedCheckins = checkins
    .filter(
      (c) =>
        !!c.comment &&
        c.comment.trim().length > 0 &&
        new Date(c.submittedAt).getTime() >= fourteenDaysAgoMs
    )
    .sort((a, b) => b.weekNumber - a.weekNumber);

  // Late-cycle hint: quiet advisory that re-treatment is typically
  // around now. Doesn't replace the physician's judgment; just helps
  // the therapist know to discuss with the patient. Threshold of 12
  // weeks is a soft default; therapists know their own patients best.
  const showLateCycleHint = !!cycle && weekNumber >= 12;

  // Patient name + summary live in the header. When data has not yet
  // loaded, render placeholders so the header keeps a stable size.
  const patientNameForHeader =
    patientData.data?.patient.displayName ?? null;
  const patientSummary = formatPatientSummary(patientInfo.data ?? null, {
    ageYears: (age) => tInfo('ageYears', { age }),
    etiology: (k) => tEt(k),
    side: (k) => tSide(k),
    ambulation: (k) => tAmb(k)
  });

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className={headerWidthClass}>
          {/* Top row — controls only. Eyebrow on the left as the peer
              of the buttons; End session pill + AccountMenu on the
              right. Mirrors the clinician header exactly. */}
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow">Physiotherapist</span>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onEndSession}
                className="rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink"
              >
                End session
              </button>
              <AccountMenu />
            </div>
          </div>
          {/* Second row — the patient. Name + (i) icon for clinical
              background; summary line below. Only renders once the
              patient data has loaded. */}
          {patientNameForHeader && (
            <div className="mt-2 min-w-0">
              <button
                type="button"
                onClick={() =>
                  router.push(
                    locale === 'en'
                      ? '/patient-info'
                      : `/${locale}/patient-info`
                  )
                }
                aria-label={tInfo('openInfo', {
                  name: patientNameForHeader
                })}
                className="group flex w-full items-center gap-1 text-left"
              >
                <span className="truncate font-display text-[20px] leading-tight text-ink group-hover:text-sage-deep">
                  {patientNameForHeader}
                </span>
                <span
                  className="-m-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted group-hover:text-sage-deep"
                  aria-hidden
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
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="11" x2="12" y2="16" />
                    <circle cx="12" cy="8" r="0.6" fill="currentColor" />
                  </svg>
                </span>
              </button>
              {patientSummary && (
                <div className="mt-0.5 truncate text-[12px] text-ink-muted">
                  {patientSummary}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className={mainWidthClass}>
        {patientData.isError ? (
          <div className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
            <p className="font-display text-[18px] text-ink">
              Could not load this patient
            </p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
              Please check your connection and try again. If it keeps
              happening, the patient may need to give you a fresh visit
              code.
            </p>
            <button
              type="button"
              onClick={() => patientData.refetch()}
              className="mt-3 flex h-10 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-on-accent hover:bg-ink-soft"
            >
              Try again
            </button>
          </div>
        ) : patientData.isLoading || !patientData.data ? (
          <SkeletonScreen label="Loading patient">
            <SkeletonBlock width="w-3/4" height="h-8" />
            <SkeletonBlock width="w-1/2" height="h-4" className="mt-2" />
            <div className="mt-8">
              <SkeletonBlock width="w-1/3" height="h-6" />
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="mt-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5"
                >
                  <SkeletonParagraph lines={2} />
                </div>
              ))}
            </div>
          </SkeletonScreen>
        ) : (
          <div className={bodyColumnClass}>
            {/* Cycle context — name + summary now live in the header,
                so the body starts directly here (matching the clinician
                page, which also begins with cycle context under its
                header). The label now includes the post-injection
                week, a bare fact the therapist can interpret. */}
            {patientData.data.cycle ? (
              <p className="text-[14px] text-ink-soft">
                {t('cycleLabel', {
                  week: weekNumber
                })}
              </p>
            ) : (
              <p className="text-[14px] text-ink-muted">
                {t('noActiveCycle')}
              </p>
            )}

            {/* Late-cycle hint — quiet amber advisory, only when the
                cycle has reached the typical re-treatment window. Does
                not pre-empt the physician's call; just nudges the
                therapist that a conversation about the next visit may
                be in order. */}
            {showLateCycleHint && (
              <div className="mt-3 rounded-[var(--radius-button)] border border-amber-deep/40 bg-amber-soft/40 px-3 py-2">
                <p className="text-[13px] leading-snug text-ink-soft">
                  ↻ {t('lateCycleHint')}
                </p>
              </div>
            )}

            {/* Patient's voice — comments from the last 14 days of
                check-ins. Quoted with light styling so the therapist
                reads them in the patient's own words. Hidden when
                there are no recent comments (no empty heading). */}
            {recentCommentedCheckins.length > 0 &&
              patientNameForHeader && (
                <section className="mt-5">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                    {t('recentCommentsHeading')}
                  </h2>
                  <ul className="mt-2 space-y-2">
                    {recentCommentedCheckins.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-r-[var(--radius-button)] border-l-2 border-sage/50 bg-cream-soft px-3 py-2"
                      >
                        <div className="text-[11px] text-ink-muted">
                          {t('recentCommentsAttribution', {
                            name: patientNameForHeader,
                            week: c.weekNumber
                          })}
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-[13px] italic leading-snug text-ink">
                          “{c.comment}”
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

            {patientData.data.cycle ? (
              <>
                {/* Action row — always-visible secondary entry points,
                    placed high so they're not buried below goals.
                    Mirrors the clinician's PatientActionRow position. */}
                <PhysioActionRow
                  openPanel={openPanel}
                  onSelect={(id) =>
                    setOpenPanel((cur) => (cur === id ? null : id))
                  }
                  labels={{
                    muscles: t('actionMuscles'),
                    suggestGoal: t('actionSuggestGoal'),
                    suggestMuscle: t('actionSuggestMuscle'),
                    history: t('actionHistory')
                  }}
                  shortLabels={{
                    muscles: t('actionShortMuscles'),
                    suggestGoal: t('actionShortSuggestGoal'),
                    suggestMuscle: t('actionShortSuggestMuscle'),
                    history: t('actionShortHistory')
                  }}
                />

                {/* Inline panel — only one open at a time. Progress
                    reporting is NOT in this set — that primary action
                    has its own page (/physio/progress) so the form has
                    room to breathe and the therapist's attention
                    narrows to one task. */}
                {openPanel === 'muscles' && (
                  <div className="mt-3">
                    {patientData.data.latestTreatment ? (
                      <TreatedMusclesSection
                        date={patientData.data.latestTreatment.date}
                        muscles={patientData.data.latestTreatment.muscles}
                        locale={locale}
                      />
                    ) : (
                      <p className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4 text-[14px] text-ink-muted">
                        {t('musclesNone')}
                      </p>
                    )}
                  </div>
                )}
                {openPanel === 'suggestGoal' && (
                  <div className="mt-3">
                    <PhysioGoalSuggestionForm
                      patientId={patientData.data.patient.id}
                    />
                  </div>
                )}
                {openPanel === 'suggestMuscle' && (
                  <div className="mt-3">
                    <PhysioMuscleSuggestionForm
                      patientId={patientData.data.patient.id}
                      goals={patientData.data.goals}
                    />
                  </div>
                )}
                {openPanel === 'history' && (
                  <AssessmentHistoryPanel
                    assessments={patientData.data.assessments}
                    goals={patientData.data.goals}
                    locale={locale}
                  />
                )}

                {/* PRIMARY ACTION — Report progress. Navigates to its
                    own page (/physio/progress), mirroring the clinician's
                    "Start new treatment cycle" → /clinician/treatment.
                    The form is substantial (per-goal ratings + note),
                    so a dedicated page beats inline expansion. Disabled
                    with a hint when the patient has no goals to rate. */}
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      locale === 'en'
                        ? '/physio/progress'
                        : `/${locale}/physio/progress`
                    )
                  }
                  disabled={patientData.data.goals.length === 0}
                  className="mt-5 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-muted"
                >
                  {t('reportProgress')}
                </button>
                {patientData.data.goals.length === 0 && (
                  <p className="mt-2 text-[13px] text-ink-muted">
                    {t('noGoalsToReport')}
                  </p>
                )}
              </>
            ) : (
              <div className="mt-10 rounded-[var(--radius-card)] border border-dashed border-stone bg-cream-soft/60 p-5">
                <p className="text-[14px] leading-relaxed text-ink-soft">
                  {t('noCycleHint')}
                </p>
              </div>
            )}

            {/* Active goals with progress charts. Comes AFTER the
                action row + report-progress button, matching the
                clinician layout (action row up top, primary button,
                then goals below). */}
            <section className="mt-10">
              <h2 className="font-display text-[18px] text-ink">
                {t('goalsHeading')}
              </h2>
              {patientData.data.goals.length === 0 ? (
                <p className="mt-3 text-[14px] text-ink-muted">
                  {t('noGoals')}
                </p>
              ) : (
                <ul className={goalsListClass}>
                  {patientData.data.goals.map((g) => (
                    <li key={g.id}>
                      <GoalProgressView
                        goalText={g.patientFacingText}
                        currentWeek={weekNumber}
                        ratings={ratingsByGoal.get(g.id) ?? []}
                        physioRatings={physioRatingsByGoal.get(g.id) ?? []}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Therapist's exercise plan & assistive devices —
                per-patient, persists across cycles, editable any time.
                Stays at the bottom: reference / setup, not the routine
                action. */}
            <PhysioPlanSection
              patientId={patientData.data.patient.id}
              exercisePlan={patientData.data.patient.exercisePlan}
              assistiveDevices={patientData.data.patient.assistiveDevices}
            />
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * The "muscles treated" section on the therapist's patient page.
 *
 * Two deliberate design choices, both prompted by the original list
 * reading as messy and over-prominent:
 *
 *  1. COLLAPSED BY DEFAULT. The injected-muscle list is secondary
 *     reference — useful when the therapist is planning exercise work,
 *     but not the focus of the page. It sits behind a header button
 *     showing a count; the therapist opens it when they want it.
 *
 *  2. GROUPED. The stored data has one row per muscle-and-side, so a
 *     muscle injected on both sides appeared twice. groupTreatedMuscles
 *     collapses to one entry per muscle with the sides combined and the
 *     list sorted, so it reads as a clean list.
 */
function TreatedMusclesSection({
  date,
  muscles,
  locale
}: {
  date: string;
  muscles: { muscle: string; side: 'left' | 'right' | 'bilateral' }[];
  locale: string;
}) {
  const t = useTranslations('physio');
  const grouped = groupTreatedMuscles(muscles);
  const isEmpty = grouped.length === 0;

  // Map a grouped muscle's side key to its localised label.
  const sideLabel = (key: 'left' | 'right' | 'leftRight' | 'both') => {
    switch (key) {
      case 'left':
        return t('sideLeft');
      case 'right':
        return t('sideRight');
      case 'leftRight':
        return t('sideLeftRight');
      case 'both':
        return t('sideBoth');
    }
  };

  // No internal foldout: this section is shown only when the
  // therapist taps the "Muscles" icon in the action row. The row
  // already controls visibility — an extra chevron here would be a
  // redundant fold-inside-a-fold. Render straight content instead.
  return (
    <section className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
      <h3 className="font-display text-[16px] leading-tight text-ink">
        {t('musclesTreatedTitle')}
      </h3>
      <p className="mt-0.5 text-[13px] text-ink-muted">
        {t('musclesTreatedFrom', { date: formatLongDate(date, locale) })}
      </p>
      {isEmpty ? (
        <p className="mt-2 text-[14px] text-ink-muted">{t('musclesNone')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-stone/70 rounded-[var(--radius-button)] border border-stone bg-cream">
          {grouped.map((g) => (
            <li
              key={g.muscle}
              className="flex items-baseline justify-between gap-3 px-4 py-2.5"
            >
              <span className="text-[14px] text-ink">{g.muscle}</span>
              <span className="shrink-0 text-[13px] text-ink-muted">
                {sideLabel(g.sideKey)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Past therapist assessments for the active cycle, oldest first.
 * Each entry shows its date, optional note, and any goal ratings the
 * therapist gave at that visit. When goal text is available, ratings
 * are labelled with the goal name so the physician (and the therapist
 * themselves) can read at a glance how each goal was rated over time.
 */
function AssessmentHistoryPanel({
  assessments,
  goals,
  locale
}: {
  assessments: {
    id: string;
    assessmentDate: string;
    note: string | null;
    ratings: { approvedGoalId: string; nrsValue: number }[];
  }[];
  goals: { id: string; patientFacingText: string }[];
  locale: string;
}) {
  const t = useTranslations('physio');
  const goalById = new Map(goals.map((g) => [g.id, g.patientFacingText]));

  return (
    <section className="mt-3">
      <h3 className="font-display text-[16px] text-ink">
        {t('historyHeading')}
      </h3>
      {assessments.length === 0 ? (
        <p className="mt-2 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4 text-[14px] text-ink-muted">
          {t('historyEmpty')}
        </p>
      ) : (
        <ol className="mt-2 space-y-2">
          {assessments
            .slice()
            .reverse()
            .map((a) => (
              <li
                key={a.id}
                className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
              >
                <div className="eyebrow">
                  {t('historyEntryHeader', {
                    date: formatLongDate(a.assessmentDate, locale)
                  })}
                </div>
                {a.ratings.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[12px] font-semibold text-ink-soft">
                      {t('historyRatingsLabel')}
                    </div>
                    <ul className="mt-1 space-y-0.5 text-[13px] text-ink-soft">
                      {a.ratings.map((r) => (
                        <li key={r.approvedGoalId}>
                          {goalById.get(r.approvedGoalId) ?? r.approvedGoalId}
                          {' — '}
                          <span className="font-semibold">{r.nrsValue}/10</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {a.note && (
                  <div className="mt-2">
                    <div className="text-[12px] font-semibold text-ink-soft">
                      {t('historyNoteLabel')}
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-ink-soft">
                      {a.note}
                    </p>
                  </div>
                )}
              </li>
            ))}
        </ol>
      )}
    </section>
  );
}
