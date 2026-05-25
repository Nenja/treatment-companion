'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  useCurrentClinicianSession,
  useEndClinicianSession
} from '@/lib/supabase/clinicianSession';
import { usePhysioPatientData } from '@/lib/supabase/physioPatient';
import { formatLongDate } from '@/lib/dates';
import { PhysioTabs } from '@/components/physio/PhysioTabs';
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
  const { user, profile, loading: authLoading } = useAuth();
  const sessionQuery = useCurrentClinicianSession(
    profile?.id ?? null,
    profile?.role
  );
  const patientData = usePhysioPatientData(
    profile?.id ?? null,
    profile?.role
  );
  const endSession = useEndClinicianSession();

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
    if (!sessionQuery.isLoading && sessionQuery.data === null) {
      router.replace(unlockPath);
    }
  }, [sessionQuery.isLoading, sessionQuery.data, router, unlockPath]);

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
        <div className="mx-auto flex max-w-[480px] items-center justify-between px-5 py-4">
          <button
            type="button"
            onClick={onEndSession}
            className="text-[14px] font-semibold text-ink-soft hover:text-ink"
          >
            End session
          </button>
          <span className="eyebrow">Physiotherapist</span>
          <AccountMenu />
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
            <h1 className="font-display text-[26px] leading-tight text-ink">
              {patientData.data.patient.displayName}
            </h1>
            {patientData.data.cycle ? (
              <p className="mt-1 text-[14px] text-ink-soft">
                Cycle {patientData.data.cycle.cycleNumber}
              </p>
            ) : (
              <p className="mt-1 text-[14px] text-ink-muted">
                No active treatment cycle yet.
              </p>
            )}

            <section className="mt-8">
              <h2 className="font-display text-[18px] text-ink">
                Treatment goals
              </h2>
              {patientData.data.goals.length === 0 ? (
                <p className="mt-3 text-[14px] text-ink-muted">
                  No active goals for this patient yet.
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

            {/* Most recent treatment — which muscles were injected, so
                the therapist can plan exercise work around it.
                Collapsed by default: secondary reference, not the main
                focus of the page. Read-only; latest session only. */}
            {patientData.data.latestTreatment && (
              <TreatedMusclesSection
                date={patientData.data.latestTreatment.date}
                muscles={patientData.data.latestTreatment.muscles}
                locale={locale}
              />
            )}

            {/* Progress reporting + goal & muscle suggestions, in tabs
                so each task is one tap away rather than a long scroll
                (slices 2-4; tabs added later). */}
            {patientData.data.cycle ? (
              <PhysioTabs
                patientId={patientData.data.patient.id}
                goals={patientData.data.goals}
              />
            ) : (
              <div className="mt-10 rounded-[var(--radius-card)] border border-dashed border-stone bg-cream-soft/60 p-5">
                <p className="text-[14px] leading-relaxed text-ink-soft">
                  Progress reporting and suggestions become available
                  once the patient has an active treatment cycle.
                </p>
              </div>
            )}
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
