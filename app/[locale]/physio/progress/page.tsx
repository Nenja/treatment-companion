'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useCurrentClinicianSession } from '@/lib/supabase/clinicianSession';
import { usePhysioPatientData } from '@/lib/supabase/physioPatient';
import { PhysioProgressForm } from '@/components/physio/PhysioProgressForm';
import {
  SkeletonBlock,
  SkeletonParagraph,
  SkeletonScreen
} from '@/components/feedback/Skeleton';

/**
 * Dedicated page for the therapist's primary action: reporting
 * progress against the patient's goals. Mirrors the clinician's
 * /clinician/treatment page in pattern — the routine primary task
 * gets its own page rather than living as an inline panel, so the
 * therapist's attention narrows to one task and the form has room
 * to breathe.
 *
 * Save → navigates back to /physio/patient. Cancel/Back also returns
 * there. No state is lost on the patient page because that page
 * re-fetches on mount.
 */
export default function PhysioProgressPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('physio');

  const { user, profile, loading: authLoading } = useAuth();
  const sessionQuery = useCurrentClinicianSession(
    profile?.id ?? null,
    profile?.role
  );
  const patientData = usePhysioPatientData(
    profile?.id ?? null,
    profile?.role
  );

  // Auth + role gating: therapist only.
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

  // No session → unlock screen.
  useEffect(() => {
    if (sessionQuery.status === 'success' && !sessionQuery.data) {
      router.replace(locale === 'en' ? '/physio' : `/${locale}/physio`);
    }
  }, [sessionQuery.status, sessionQuery.data, router, locale]);

  const back = () =>
    router.push(
      locale === 'en' ? '/physio/patient' : `/${locale}/physio/patient`
    );

  if (
    authLoading ||
    !profile ||
    profile.role !== 'physiotherapist' ||
    sessionQuery.isLoading ||
    !sessionQuery.data ||
    patientData.isLoading ||
    !patientData.data
  ) {
    return (
      <div className="min-h-dvh bg-cream">
        <main className="mx-auto max-w-[480px] px-5 pb-16 pt-6">
          <SkeletonScreen label="Loading">
            <SkeletonBlock width="w-1/3" height="h-5" />
            <SkeletonBlock width="w-2/3" height="h-7" className="mt-3" />
            <div className="mt-6 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
              <SkeletonParagraph lines={4} />
            </div>
          </SkeletonScreen>
        </main>
      </div>
    );
  }

  const { patient, goals, cycle } = patientData.data;

  return (
    <div className="min-h-dvh bg-cream">
      <main className="mx-auto max-w-[480px] px-5 pb-16 pt-6">
        <button
          type="button"
          onClick={back}
          className="mb-3 inline-flex items-center gap-1 text-[14px] font-semibold text-sage-deep hover:text-ink"
        >
          ← {t('back')}
        </button>

        <div className="eyebrow">{t('reportProgress')}</div>
        <h1 className="mt-0.5 font-display text-[24px] leading-tight text-ink">
          {patient.displayName}
        </h1>
        {cycle && (
          <p className="mt-1 text-[14px] text-ink-soft">
            {t('cycleLabel', { number: cycle.cycleNumber })}
          </p>
        )}

        {/* The form handles its own header, fields, recent
            assessments list, and submission. We pass `onSaved` so the
            page navigates back after a successful submission, instead
            of leaving the therapist on a freshly-reset form. */}
        {goals.length === 0 ? (
          <p className="mt-6 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4 text-[14px] text-ink-muted">
            {t('noGoalsToReport')}
          </p>
        ) : (
          <PhysioProgressForm
            patientId={patient.id}
            goals={goals}
            onSaved={back}
          />
        )}
      </main>
    </div>
  );
}
