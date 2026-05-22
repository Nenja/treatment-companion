'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  useCurrentClinicianSession,
  useEndClinicianSession
} from '@/lib/supabase/clinicianSession';
import { usePhysioPatientData } from '@/lib/supabase/physioPatient';
import { PhysioProgressForm } from '@/components/physio/PhysioProgressForm';
import { PhysioGoalSuggestionForm } from '@/components/physio/PhysioGoalSuggestionForm';
import { PhysioMuscleSuggestionForm } from '@/components/physio/PhysioMuscleSuggestionForm';
import { AccountMenu } from '@/components/layout/AccountMenu';
import {
  SkeletonBlock,
  SkeletonParagraph,
  SkeletonScreen
} from '@/components/feedback/Skeleton';

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

  // No active session → back to unlock.
  useEffect(() => {
    if (!sessionQuery.isLoading && sessionQuery.data === null) {
      router.replace(unlockPath);
    }
  }, [sessionQuery.isLoading, sessionQuery.data, router, unlockPath]);

  const onEndSession = async () => {
    await endSession.mutateAsync();
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
        {patientData.isLoading || !patientData.data ? (
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

            {/* Progress reporting + goal & muscle suggestions —
                slices 2, 3 & 4. */}
            {patientData.data.cycle &&
            patientData.data.goals.length > 0 ? (
              <>
                <PhysioProgressForm
                  patientId={patientData.data.patient.id}
                  goals={patientData.data.goals}
                />
                <PhysioGoalSuggestionForm
                  patientId={patientData.data.patient.id}
                />
                <PhysioMuscleSuggestionForm
                  patientId={patientData.data.patient.id}
                  goals={patientData.data.goals}
                />
              </>
            ) : patientData.data.cycle ? (
              // Active cycle but no goals yet — progress reporting needs
              // goals, but the physiotherapist can still suggest a goal
              // or flag a muscle.
              <>
                <PhysioGoalSuggestionForm
                  patientId={patientData.data.patient.id}
                />
                <PhysioMuscleSuggestionForm
                  patientId={patientData.data.patient.id}
                  goals={patientData.data.goals}
                />
              </>
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
