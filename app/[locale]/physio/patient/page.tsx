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
import {
  PhysioActionRow,
  type PhysioActionId
} from '@/components/physio/PhysioActionRow';
import { PhysioProgressForm } from '@/components/physio/PhysioProgressForm';
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

  // Inline panel open under the action row, or the progress form.
  // 'progress' is the primary button; the other ids come from the row.
  // Only one panel open at a time.
  const [openPanel, setOpenPanel] = useState<
    'progress' | PhysioActionId | null
  >(null);

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

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className="mx-auto flex max-w-[480px] items-center justify-between gap-3 px-5 py-3">
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
      </header>

      <main className="mx-auto max-w-[480px] px-5 pb-16 pt-6">
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
          <>
            <div className="flex items-center gap-1">
              <div className="font-display text-[26px] leading-tight text-ink">
                {patientData.data.patient.displayName}
              </div>
              {/* Patient-info opener (matches clinician page). Visible
                  glyph is 18px but the tap target is 36px. */}
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
                  name: patientData.data.patient.displayName
                })}
                className="-m-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-sage-deep"
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
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="11" x2="12" y2="16" />
                  <circle cx="12" cy="8" r="0.6" fill="currentColor" />
                </svg>
              </button>
            </div>
            {(() => {
              const summary = formatPatientSummary(patientInfo.data ?? null, {
                ageYears: (age) => tInfo('ageYears', { age }),
                etiology: (k) => tEt(k),
                side: (k) => tSide(k),
                ambulation: (k) => tAmb(k)
              });
              return summary ? (
                <div className="mt-0.5 text-[13px] text-ink-muted">
                  {summary}
                </div>
              ) : null;
            })()}
            {patientData.data.cycle ? (
              <p className="mt-1 text-[14px] text-ink-soft">
                {t('cycleLabel', {
                  number: patientData.data.cycle.cycleNumber
                })}
              </p>
            ) : (
              <p className="mt-1 text-[14px] text-ink-muted">
                {t('noActiveCycle')}
              </p>
            )}

            <section className="mt-8">
              <h2 className="font-display text-[18px] text-ink">
                {t('goalsHeading')}
              </h2>
              {patientData.data.goals.length === 0 ? (
                <p className="mt-3 text-[14px] text-ink-muted">
                  {t('noGoals')}
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {patientData.data.goals.map((g) => (
                    <li
                      key={g.id}
                      className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5"
                    >
                      <p className="font-display text-[17px] leading-snug text-ink">
                        {g.patientFacingText}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* PRIMARY ACTION — recording an assessment is the routine
                thing a therapist does at every session, so it leads the
                page like the patient's check-in CTA. Disabled when the
                patient has no goals yet (nothing to rate against) and
                explained inline. */}
            {patientData.data.cycle ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setOpenPanel((p) => (p === 'progress' ? null : 'progress'))
                  }
                  disabled={patientData.data.goals.length === 0}
                  className="mt-8 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-muted"
                >
                  {t('reportProgress')}
                </button>
                {patientData.data.goals.length === 0 && (
                  <p className="mt-2 text-[13px] text-ink-muted">
                    {t('noGoalsToReport')}
                  </p>
                )}

                {/* Action row — secondary entry points, always visible.
                    Tapping opens an inline panel below. */}
                <PhysioActionRow
                  openPanel={
                    openPanel === 'progress' ? null : openPanel
                  }
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

                {/* Inline panel — only one open at a time. */}
                {openPanel === 'progress' &&
                  patientData.data.goals.length > 0 && (
                    <div className="mt-3">
                      <PhysioProgressForm
                        patientId={patientData.data.patient.id}
                        goals={patientData.data.goals}
                      />
                    </div>
                  )}
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
              </>
            ) : (
              <div className="mt-10 rounded-[var(--radius-card)] border border-dashed border-stone bg-cream-soft/60 p-5">
                <p className="text-[14px] leading-relaxed text-ink-soft">
                  {t('noCycleHint')}
                </p>
              </div>
            )}

            {/* Therapist's exercise plan & assistive devices —
                per-patient, persists across cycles, editable any time.
                Stays at the bottom: it's reference / setup, not the
                routine action. */}
            <PhysioPlanSection
              patientId={patientData.data.patient.id}
              exercisePlan={patientData.data.patient.exercisePlan}
              assistiveDevices={patientData.data.patient.assistiveDevices}
            />
          </>
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
  const [open, setOpen] = useState(false);

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

  return (
    <section className="mt-8">
      {/* Header button — toggles the list. Shows a count so the
          therapist knows there is something there without opening it. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-3 text-left hover:bg-stone-soft"
      >
        <span className="flex flex-col">
          <span className="font-display text-[17px] leading-tight text-ink">
            {t('musclesTreatedTitle')}
          </span>
          <span className="mt-0.5 text-[13px] text-ink-muted">
            {isEmpty
              ? t('musclesTreatedFrom', {
                  date: formatLongDate(date, locale)
                })
              : t('musclesCount', { count: grouped.length })}
          </span>
        </span>
        {/* Chevron — rotates when open. Matches the app's existing
            collapsible cards (CatchUpCard). */}
        <span
          aria-hidden
          className={`text-[14px] text-ink-muted transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="mt-2">
          <p className="text-[13px] text-ink-muted">
            {t('musclesTreatedFrom', { date: formatLongDate(date, locale) })}
          </p>
          {isEmpty ? (
            <p className="mt-2 text-[14px] text-ink-muted">
              {t('musclesNone')}
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-stone/70 rounded-[var(--radius-button)] border border-stone bg-cream-soft">
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
