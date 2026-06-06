'use client';

import { Suspense } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { EndSessionButton } from '@/components/clinician/EndSessionButton';
import { RecordGoalForm } from '@/components/clinician/RecordGoalForm';

/**
 * Record a goal the patient voiced in clinic — full-page route.
 *
 * The form itself lives in <RecordGoalForm/>, shared with the patient
 * page's record-goal slide-over so recording can also happen without
 * leaving the chart. This route remains for deep links and as the
 * narrow-screen fallback.
 *
 * Wrapped in <Suspense> because the worker reads ?patient= via
 * useSearchParams(), which Next.js requires a Suspense boundary around
 * for the route to prerender.
 */
export default function NewGoalPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-cream" />}>
      <NewGoalInner />
    </Suspense>
  );
}

function NewGoalInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations('newGoal');
  const { profile, loading: authLoading } = useAuth();

  const patientId = searchParams.get('patient') ?? '';
  const prefix = locale === 'en' ? '' : `/${locale}`;
  const patientPath = `${prefix}/clinician/patient`;
  const toPatient = () => router.push(patientPath);

  // Only a signed-in physician may use this page.
  if (!authLoading && profile && profile.role !== 'clinician') {
    router.replace(prefix || '/');
  }

  // No patient in the URL — nothing to do here.
  if (!patientId) {
    return (
      <div className="min-h-dvh bg-cream">
        <main className="mx-auto max-w-[480px] px-5 py-12">
          <p className="text-[15px] text-ink-soft">
            No patient selected. Open this from a patient&apos;s page.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-cream">
      <AppHeader
        width="mid"
        back={{ label: t('cancel'), onClick: toPatient }}
        middle={
          <span className="eyebrow block truncate text-center">
            {t('eyebrow')}
          </span>
        }
        actions={<EndSessionButton role="clinician" />}
        helpPageKey="newGoal"
      />

      <main className="mx-auto max-w-[var(--max-w-page-mid)] px-5 py-8">
        <RecordGoalForm
          patientId={patientId}
          onCancel={toPatient}
          onRecorded={toPatient}
        />
      </main>
    </div>
  );
}
