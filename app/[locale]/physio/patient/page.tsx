'use client';

import { useEffect, useRef, useState } from 'react';
import { BrandMark } from '@/components/layout/BrandMark';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  useCurrentClinicianSession,
  useEndClinicianSession
} from '@/lib/supabase/clinicianSession';
import { usePhysioPatientData } from '@/lib/supabase/physioPatient';
import { useGoalHandoffNotes } from '@/lib/supabase/clinicianPatient';
import { usePhysioGoalSuggestions } from '@/lib/supabase/physioGoalSuggestion';
import {
  usePatientInfo,
  formatPatientSummary
} from '@/lib/supabase/patientInfo';
import { formatLongDate } from '@/lib/dates';
import { useWideLayout } from '@/lib/useWideLayout';
import { PageHelpButton } from '@/components/feedback/PageHelpButton';
import { nrsToGas } from '@/lib/types';
import { GoalProgressView } from '@/components/clinician/GoalProgressView';
import { PhysioGoalSuggestionForm } from '@/components/physio/PhysioGoalSuggestionForm';
import { NoteToClinicCard } from '@/components/physio/NoteToClinicCard';
import { PhysioProgressForm } from '@/components/physio/PhysioProgressForm';
import { AccountMenu } from '@/components/layout/AccountMenu';
import {
  SkeletonBlock,
  SkeletonParagraph,
  SkeletonScreen
} from '@/components/feedback/Skeleton';
import { groupTreatedMuscles } from '@/lib/types';

/**
 * Physiotherapist patient view (read + suggest).
 *
 * Shows the unlocked patient's name, their goals with progress graphs,
 * recent check-in comments, and — if the patient shares them — treated
 * muscles. Inline panels let the physio report progress, suggest a goal
 * or a muscle, and view assessment history. Read-only on clinical data;
 * the physio never records goals or treatments.
 *
 * If the session has expired or there is none, redirect to /physio.
 */
export default function PhysioPatientPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('physio');
  const tA11y = useTranslations('a11y');
  const tHandoff = useTranslations('clinician.goalHandoff');
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
    ? 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 py-3 lg:max-w-[var(--max-w-page-wide)]'
    : 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 py-3';
  const mainWidthClass = wide
    ? 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 pb-16 pt-6 lg:max-w-[var(--max-w-page-wide)]'
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

  // The therapist's submitted suggestions + the physician's status on
  // them — surfaced read-only so the therapist sees what came of their
  // input (status echo). RLS already permits the read during a session.
  const goalSuggestions = usePhysioGoalSuggestions(
    sessionQuery.data?.patientId ?? null,
    !!sessionQuery.data
  );
  const goalHandoffNotes = useGoalHandoffNotes(
    patientData.data?.cycle?.id ?? null
  );

  // Which inline panel is open under the action row, if any. Only one
  // at a time. Progress reporting is NOT in this set — it's a primary
  // action that navigates to its own page (/physio/progress), like
  // the clinician's start-new-cycle button goes to /clinician/treatment.
  const [suggestGoalOpen, setSuggestGoalOpen] = useState(false);

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
    const isGas = goal.kind === 'gas';
    const points = assessments
      .flatMap((a) => {
        const r = a.ratings.find((x) => x.approvedGoalId === goal.id);
        if (!r) return [];
        // Pick the value for this goal's kind; skip flag-only rows that
        // carry no score for it.
        if (isGas) {
          if (r.gasValue == null) return [];
        } else if (r.nrsValue == null) {
          return [];
        }
        const days =
          (new Date(a.assessmentDate).getTime() - cycleStartMs) /
          (24 * 60 * 60 * 1000);
        const snappedWeek = Math.max(1, Math.round(days / 7));
        const value = isGas
          ? (r.gasValue as -2 | -1 | 0 | 1 | 2)
          : nrsToGas(r.nrsValue as number, {
              question: goal.nrsQuestion,
              direction: goal.nrsDirection,
              cutLowLow: goal.cutLowLow,
              cutLow: goal.cutLow,
              cutZero: goal.cutZero,
              cutHigh: goal.cutHigh
            });
        return [
          {
            weekNumber: snappedWeek,
            nrs: r.nrsValue ?? 0,
            value,
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
  const leftHasContent =
    showLateCycleHint ||
    !!patientData.data?.handoff ||
    !!patientData.data?.latestTreatment ||
    recentCommentedCheckins.length > 0;

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

  // Does the context rail have anything worth a column of its own? It
  // only carries the clinic note, recent patient comments, and the
  // late-cycle hint — the week line aside. With none of those, a fixed
  // 300px rail is just a big empty gutter, so we drop the two-pane and
  // render a single comfortable column instead.

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className={headerWidthClass}>
          {/* Single row: the patient (name + info link) on the left
              when loaded, taking the available width and truncating;
              the controls (end session, help, account) on the right.
              When the patient name has not loaded yet, a spacer keeps
              the controls right-aligned. End session is an icon on
              mobile. The clinical summary sits on its own line below. */}
          <div className="flex items-center gap-2">
            <BrandMark showName={false} />
            {patientNameForHeader ? (
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
                className="group flex min-w-0 flex-1 items-center gap-1 text-left"
              >
                <span className="truncate font-display text-[20px] leading-tight text-ink group-hover:text-sage-deep">
                  {patientNameForHeader}
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
            ) : (
              <div className="flex-1" />
            )}
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onEndSession}
                aria-label={t('endSession')}
                title={t('endSession')}
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
                <span className="hidden sm:inline">{t('endSession')}</span>
              </button>
              <PageHelpButton pageKey="physioPatient" />
              <AccountMenu />
            </div>
          </div>
          {patientNameForHeader && patientSummary && (
            <div className="mt-1 truncate text-[12px] text-ink-muted">
              {patientSummary}
            </div>
          )}
        </div>
      </header>

      <main className={mainWidthClass}>
        {patientData.isError ? (
          <div className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
            <p className="font-display text-[18px] text-ink">
              {t('loadErrorTitle')}
            </p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
              {t('loadErrorBody')}
            </p>
            <button
              type="button"
              onClick={() => patientData.refetch()}
              className="mt-3 flex h-10 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-on-accent hover:bg-ink-soft"
            >
              {t('loadErrorRetry')}
            </button>
          </div>
        ) : patientData.isLoading || !patientData.data ? (
          <SkeletonScreen label={tA11y('loading')}>
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
          <div>
            {patientData.data.cycle ? (
              /* Active cycle — two columns: the clinical picture pinned on
                 the left, the visit (rate + note) on the right. Collapses to
                 one column when the left is thin or on phones. */
              <div
                className={
                  wide && leftHasContent
                    ? 'lg:grid lg:grid-cols-[330px_minmax(0,1fr)] lg:gap-8 lg:items-start'
                    : ''
                }
              >
                {/* LEFT — information, read once, kept in view while rating. */}
                <div
                  className={
                    wide && leftHasContent
                      ? 'lg:sticky lg:top-6 space-y-5'
                      : 'space-y-5'
                  }
                >
                  <p className="text-[14px] text-ink-soft">
                    {t('cycleLabel', { week: weekNumber })}
                  </p>

                  {showLateCycleHint && (
                    <div className="rounded-[var(--radius-button)] border border-amber-deep/40 bg-amber-soft/40 px-3 py-2">
                      <p className="text-[13px] leading-snug text-ink-soft">
                        ↻ {t('lateCycleHint')}
                      </p>
                    </div>
                  )}

                  {(() => {
                    const visitDates = assessments
                      .map((a) => a.assessmentDate)
                      .sort();
                    const lastVisit =
                      visitDates[visitDates.length - 1] ?? null;
                    if (!lastVisit) return null;
                    const newCheckins = checkins.filter(
                      (c) => new Date(c.submittedAt) > new Date(lastVisit)
                    ).length;
                    return (
                      <div className="rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5">
                        <p className="eyebrow">{t('recapHeading')}</p>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">
                          {t('recapLastVisit', {
                            date: formatLongDate(lastVisit, locale)
                          })}
                        </p>
                        {newCheckins > 0 && (
                          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">
                            {t('recapNewCheckins', { count: newCheckins })}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {patientData.data.handoff && (
                    <section className="rounded-[var(--radius-card)] border border-sage-soft bg-sage-soft/30 p-4">
                      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-sage-deep">
                        {t('clinicNoteHeading')}
                      </h2>
                      {patientData.data.handoff.treatmentDate && (
                        <p className="mt-1 text-[12px] text-ink-muted">
                          {t('clinicNoteFrom', {
                            date: formatLongDate(
                              patientData.data.handoff.treatmentDate,
                              locale
                            )
                          })}
                        </p>
                      )}
                      {patientData.data.handoff.treatmentChanged !== null && (
                        <p className="mt-2 text-[14px] font-semibold text-ink">
                          {patientData.data.handoff.treatmentChanged
                            ? `↻ ${t('clinicNoteChanged')}`
                            : `→ ${t('clinicNoteUnchanged')}`}
                        </p>
                      )}
                      {patientData.data.handoff.note && (
                        <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
                          {patientData.data.handoff.note}
                        </p>
                      )}
                    </section>
                  )}

                  {patientData.data.latestTreatment && (
                    <TreatedMusclesSection
                      date={patientData.data.latestTreatment.date}
                      muscles={patientData.data.latestTreatment.muscles}
                      locale={locale}
                    />
                  )}

                  {recentCommentedCheckins.length > 0 &&
                    patientNameForHeader && (
                      <section>
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
                </div>

                {/* RIGHT — the visit: rate goals, note to clinic, suggest a goal. */}
                <div className="lg:min-w-0">
                  <PhysioProgressForm
                    patientId={patientData.data.patient.id}
                    goals={patientData.data.goals}
                    currentWeek={weekNumber}
                    ratingsByGoal={ratingsByGoal}
                    physioRatingsByGoal={physioRatingsByGoal}
                    goalHandoffNotes={goalHandoffNotes.data}
                    dateAside={
                      <button
                        type="button"
                        onClick={() => setSuggestGoalOpen((v) => !v)}
                        aria-expanded={suggestGoalOpen}
                        className="inline-flex items-center gap-2 rounded-[var(--radius-button)] border border-dashed border-stone bg-transparent px-4 py-2.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft"
                      >
                        <span aria-hidden>＋</span>
                        {t('actionSuggestGoal')}
                      </button>
                    }
                    afterDate={
                      suggestGoalOpen ? (
                        <div>
                          <PhysioGoalSuggestionForm
                            patientId={patientData.data.patient.id}
                          />
                          {(goalSuggestions.data ?? []).length > 0 && (
                            <div className="mt-4">
                              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                                {t('sentGoalsHeading')}
                              </h3>
                              <ul className="mt-2 space-y-2">
                                {goalSuggestions.data!.map((sg) => (
                                  <li
                                    key={sg.id}
                                    className="rounded-[var(--radius-button)] border border-stone/70 bg-cream p-2.5"
                                  >
                                    <p className="text-[14px] font-semibold leading-snug text-ink">
                                      {sg.suggestedGoal}
                                    </p>
                                    <p className="mt-1">
                                      <SuggestionStatusBadge status={sg.status} />
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : null
                    }
                  />

                  <NoteToClinicCard patientId={patientData.data.patient.id} />
                </div>
              </div>
            ) : (
              /* No active cycle — single column. */
              <div>
                <p className="text-[14px] text-ink-muted">
                  {t('noActiveCycle')}
                </p>
                <div className="mt-10 rounded-[var(--radius-card)] border border-dashed border-stone bg-cream-soft/60 p-5">
                  <p className="text-[14px] leading-relaxed text-ink-soft">
                    {t('noCycleHint')}
                  </p>
                  <div className="mt-4 border-t border-stone/60 pt-4">
                    <h3 className="font-display text-[15px] text-ink">
                      {t('preCycleSuggestTitle')}
                    </h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                      {t('preCycleSuggestHint')}
                    </p>
                    <div className="mt-4">
                      <PhysioGoalSuggestionForm
                        patientId={patientData.data.patient.id}
                      />
                    </div>
                    {(goalSuggestions.data ?? []).length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                          {t('sentGoalsHeading')}
                        </h4>
                        <ul className="mt-2 space-y-2">
                          {goalSuggestions.data!.map((sg) => (
                            <li
                              key={sg.id}
                              className="rounded-[var(--radius-button)] border border-stone/70 bg-cream p-2.5"
                            >
                              <p className="text-[14px] font-semibold leading-snug text-ink">
                                {sg.suggestedGoal}
                              </p>
                              <p className="mt-1">
                                <SuggestionStatusBadge status={sg.status} />
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
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
  const [musclesOpen, setMusclesOpen] = useState(false);

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

  // Collapsed by default: the list can be long, and on the therapist page
  // it sits in the left context column — so it opens only on demand.
  return (
    <section className="rounded-[var(--radius-card)] border border-stone bg-cream-soft">
      <button
        type="button"
        onClick={() => setMusclesOpen((o) => !o)}
        aria-expanded={musclesOpen}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <span className="min-w-0">
          <span className="block font-display text-[16px] leading-tight text-ink">
            {t('musclesTreatedTitle')}
            {!isEmpty ? ` (${grouped.length})` : ''}
          </span>
          <span className="mt-0.5 block text-[13px] text-ink-muted">
            {t('musclesTreatedFrom', { date: formatLongDate(date, locale) })}
          </span>
        </span>
        <span
          aria-hidden
          className={`shrink-0 text-ink-muted transition-transform ${
            musclesOpen ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
      </button>
      {musclesOpen && (
        <div className="px-4 pb-4">
          {isEmpty ? (
            <p className="text-[14px] text-ink-muted">{t('musclesNone')}</p>
          ) : (
            <ul className="divide-y divide-stone/70 rounded-[var(--radius-button)] border border-stone bg-cream">
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
        </div>
      )}
    </section>
  );
}

/**
 * Read-only badge echoing the physician's status on a therapist
 * suggestion (status echo). Maps the stored status to a plain,
 * non-clinical label so the therapist knows what came of their input,
 * without any clinic→therapist messaging.
 */
function SuggestionStatusBadge({ status }: { status: string }) {
  const t = useTranslations('physio');
  const map: Record<string, { key: string; tone: 'pending' | 'good' | 'muted' }> =
    {
      needsReview: { key: 'statusPending', tone: 'pending' },
      accepted: { key: 'statusAccepted', tone: 'good' },
      reviewed: { key: 'statusReviewed', tone: 'good' },
      dismissed: { key: 'statusDismissed', tone: 'muted' }
    };
  const entry = map[status] ?? { key: 'statusPending', tone: 'pending' as const };
  const toneClass =
    entry.tone === 'good'
      ? 'bg-sage-soft text-sage-deep'
      : entry.tone === 'muted'
        ? 'bg-stone-soft text-ink-muted'
        : 'bg-amber-soft text-ink';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${toneClass}`}
    >
      {t(entry.key)}
    </span>
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
    ratings: { approvedGoalId: string; nrsValue: number | null }[];
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
