'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import {
  useCurrentClinicianSession,
  useTouchClinicianSession
} from '@/lib/supabase/clinicianSession';
import {
  useApproveSuggestion,
  useSetSuggestionStatus
} from '@/lib/supabase/clinicianPatient';
import { formatLongDate } from '@/lib/dates';
import type { NrsDirection } from '@/lib/types';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { GasCutPoints } from '@/components/clinician/GasCutPoints';
import { useToast } from '@/components/feedback/Toast';
import {
  SkeletonBlock,
  SkeletonParagraph,
  SkeletonScreen
} from '@/components/feedback/Skeleton';
import { classifyError } from '@/lib/feedback';

export default function SuggestionReviewPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-cream" />}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations('clinician.review');
  const tApprove = useTranslations('clinician.approve');
  const tDomain = useTranslations('domain');
  const tImportance = useTranslations('importance');

  const id = searchParams.get('id') ?? '';

  const { user, profile, loading: authLoading } = useAuth();
  const sessionQuery = useCurrentClinicianSession(
    profile?.id ?? null,
    profile?.role
  );
  const touchSession = useTouchClinicianSession();
  const approve = useApproveSuggestion();
  const setStatus = useSetSuggestionStatus();
  const toast = useToast();
  const tFeedback = useTranslations('feedback');

  const patientHomePath =
    locale === 'en' ? '/clinician/patient' : `/${locale}/clinician/patient`;

  // Auth gating.
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

  // Bounce if session timed out.
  useEffect(() => {
    if (!sessionQuery.isLoading && sessionQuery.data === null) {
      router.replace(
        (locale === 'en' ? '/clinician' : `/${locale}/clinician`) +
          '?timeout=1'
      );
    }
  }, [sessionQuery.isLoading, sessionQuery.data, router, locale]);

  // Fetch the suggestion itself
  const suggestionQuery = useQuery({
    queryKey: ['suggestion', id],
    enabled: !!id && !!sessionQuery.data,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('goal_suggestion')
        .select(
          'id, patient_id, domain, patient_wording, importance, hoped_timeframe, difficulty_context, created_at, status'
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  });

  // Approval form state
  const [showApproveForm, setShowApproveForm] = useState(false);
  const [patientText, setPatientText] = useState('');
  const [smartText, setSmartText] = useState('');
  const [nrsQuestion, setNrsQuestion] = useState('');
  const [nrsDirection, setNrsDirection] = useState<NrsDirection>('higherIsBetter');
  // Default cut points for the higherIsBetter case. Clinician can edit.
  const [cutLowLow, setCutLowLow] = useState<string>('2');
  const [cutLow, setCutLow] = useState<string>('4');
  const [cutZero, setCutZero] = useState<string>('5');
  const [cutHigh, setCutHigh] = useState<string>('7');

  if (
    authLoading ||
    !profile ||
    profile.role !== 'clinician' ||
    sessionQuery.isLoading ||
    !sessionQuery.data
  ) {
    return <div className="min-h-dvh bg-cream" />;
  }

  if (suggestionQuery.isLoading) {
    return (
      <div className="min-h-dvh bg-cream">
        <header className="border-b border-stone/70 bg-cream-soft/50">
          <div className="mx-auto flex max-w-[480px] items-center justify-between px-5 py-4">
            <SkeletonBlock width="w-16" height="h-4" />
            <SkeletonBlock width="w-8" height="h-8" shape="rounded-full" />
          </div>
        </header>
        <main className="mx-auto max-w-[480px] px-5 pb-16 pt-6">
          <SkeletonScreen label="Loading suggestion">
            <SkeletonBlock width="w-3/4" height="h-7" />
            <SkeletonBlock width="w-1/3" height="h-4" className="mt-2" />

            {/* Patient wording card */}
            <div className="mt-6 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5">
              <SkeletonBlock width="w-1/3" height="h-5" />
              <SkeletonParagraph lines={3} className="mt-3" />
            </div>

            {/* Action buttons row */}
            <div className="mt-8 space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <SkeletonBlock
                  key={i}
                  width="w-full"
                  height="h-12"
                  shape="rounded-[var(--radius-button)]"
                />
              ))}
            </div>
          </SkeletonScreen>
        </main>
      </div>
    );
  }

  if (!suggestionQuery.data) {
    // Bad id or no access — go back to patient view.
    router.replace(patientHomePath);
    return <div className="min-h-dvh bg-cream" />;
  }

  const suggestion = suggestionQuery.data;
  const back = () => router.push(patientHomePath);

  // Shared helper for the three "defer / combine / not suitable" actions.
  // They differ only in the target status string; the error handling is
  // identical and prone to clinician-unlock-expiry like the others.
  const doSetStatus = async (
    status: 'discussAtNextVisit' | 'combinedWithAnother' | 'notSuitableThisCycle'
  ) => {
    try {
      await setStatus.mutateAsync({
        suggestionId: suggestion.id,
        status
      });
      touchSession.mutate();
      back();
    } catch (err) {
      const key = classifyError(err);
      toast.error(tFeedback(key));
      if (key === 'errorClinicianUnlockExpired') {
        setTimeout(() => {
          router.push(
            locale === 'en' ? '/clinician' : `/${locale}/clinician`
          );
        }, 1500);
      }
    }
  };

  const onDefer = () => doSetStatus('discussAtNextVisit');
  const onCombine = () => doSetStatus('combinedWithAnother');
  const onNotSuitable = () => doSetStatus('notSuitableThisCycle');

  const startApprove = (prefilled: boolean) => {
    if (prefilled) setPatientText(suggestion.patient_wording as string);
    setShowApproveForm(true);
  };

  // Parse cut points to numbers; require monotonic increasing and in range.
  const cutLowLowN = parseInt(cutLowLow, 10);
  const cutLowN = parseInt(cutLow, 10);
  const cutZeroN = parseInt(cutZero, 10);
  const cutHighN = parseInt(cutHigh, 10);
  const cutsValid =
    Number.isInteger(cutLowLowN) &&
    Number.isInteger(cutLowN) &&
    Number.isInteger(cutZeroN) &&
    Number.isInteger(cutHighN) &&
    cutLowLowN >= 0 &&
    cutHighN <= 9 &&
    cutLowLowN < cutLowN &&
    cutLowN < cutZeroN &&
    cutZeroN < cutHighN;

  const canSubmitApprove =
    patientText.trim() &&
    smartText.trim() &&
    nrsQuestion.trim() &&
    cutsValid;

  const submitApprove = async () => {
    if (!canSubmitApprove || approve.isPending) return;
    try {
      await approve.mutateAsync({
        suggestionId: suggestion.id,
        patientFacingText: patientText,
        smartText,
        nrsQuestion,
        nrsDirection,
        cutLowLow: cutLowLowN,
        cutLow: cutLowN,
        cutZero: cutZeroN,
        cutHigh: cutHighN
      });
      touchSession.mutate();
      toast.success(tFeedback('successApproved'));
      back();
    } catch (err) {
      const key = classifyError(err);
      toast.error(tFeedback(key));
      if (key === 'errorClinicianUnlockExpired') {
        setTimeout(() => {
          router.push(
            locale === 'en' ? '/clinician' : `/${locale}/clinician`
          );
        }, 1500);
      }
    }
  };

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className="mx-auto flex max-w-[480px] items-center justify-between px-5 py-4">
          <button
            type="button"
            onClick={back}
            className="text-[14px] font-semibold text-ink-soft hover:text-ink"
          >
            ← {t('back')}
          </button>
          <span className="eyebrow">{t('title')}</span>
          <AccountMenu />
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-5 pb-16 pt-6">
        <section className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5">
          <dl className="space-y-3 text-[14px]">
            <Row label={t('patientWordsLabel')}>
              <p className="font-display text-[18px] leading-snug text-ink">
                &ldquo;{suggestion.patient_wording}&rdquo;
              </p>
            </Row>
            <Row label={t('areaLabel')}>
              <p>{tDomain(suggestion.domain as string)}</p>
            </Row>
            <Row label={t('importanceLabel')}>
              <p>{tImportance(suggestion.importance as string)}</p>
            </Row>
            {suggestion.difficulty_context && (
              <Row label={t('contextLabel')}>
                <p className="whitespace-pre-wrap">
                  {suggestion.difficulty_context as string}
                </p>
              </Row>
            )}
            <Row label={t('submittedLabel')}>
              <p className="text-ink-soft">
                {formatLongDate(
                  (suggestion.created_at as string).slice(0, 10),
                  locale
                )}
              </p>
            </Row>
          </dl>
        </section>

        {!showApproveForm ? (
          <section className="mt-8">
            <h2 className="font-display text-[18px] text-ink">
              {t('actionsTitle')}
            </h2>
            <div className="mt-4 space-y-2">
              <ActionButton primary onClick={() => startApprove(true)}>
                {t('approve')}
              </ActionButton>
              <ActionButton onClick={() => startApprove(false)}>
                {t('editAndApprove')}
              </ActionButton>
              <ActionButton onClick={onDefer}>{t('discuss')}</ActionButton>
              <ActionButton onClick={onCombine}>{t('combine')}</ActionButton>
              <ActionButton onClick={onNotSuitable}>
                {t('notSuitable')}
              </ActionButton>
            </div>
          </section>
        ) : (
          <section className="mt-8">
            <h2 className="font-display text-[20px] leading-tight text-ink">
              {tApprove('title')}
            </h2>
            <p className="mt-2 rounded-[var(--radius-button)] border border-stone bg-cream-soft p-3 text-[14px] leading-relaxed text-ink-soft">
              {tApprove('headerNote')}
            </p>

            <Field
              label={tApprove('patientTextLabel')}
              helper={tApprove('patientTextHelper')}
            >
              <input
                type="text"
                value={patientText}
                onChange={(e) => setPatientText(e.target.value)}
                className={inputClasses}
                maxLength={120}
              />
            </Field>

            <Field
              label={tApprove('smartLabel')}
              helper={tApprove('smartHelper')}
            >
              <textarea
                value={smartText}
                onChange={(e) => setSmartText(e.target.value)}
                rows={3}
                className={inputClasses}
                maxLength={400}
              />
            </Field>

            <h3 className="mt-8 font-display text-[17px] text-ink">
              NRS rating setup
            </h3>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
              The patient will rate this goal on a 0-10 scale each week.
              You decide the question they see and how to map their
              answer to a GAS bucket.
            </p>

            <Field
              label="NRS question (patient-facing)"
              helper="Write the exact question the patient sees each week."
            >
              <textarea
                value={nrsQuestion}
                onChange={(e) => setNrsQuestion(e.target.value)}
                rows={3}
                placeholder="e.g. On a scale of 0-10, how easy is it to open your hand for washing? (0 = impossible, 10 = completely easy)"
                className={inputClasses}
                maxLength={300}
              />
            </Field>

            <Field
              label="Direction"
              helper="Pick what 'higher' means on the 0-10 scale for this goal."
            >
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setNrsDirection('higherIsBetter')}
                  className={`flex-1 rounded-[var(--radius-button)] border px-3 py-2.5 text-[14px] font-semibold ${
                    nrsDirection === 'higherIsBetter'
                      ? 'border-sage bg-sage-soft text-sage-deep'
                      : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
                  }`}
                >
                  Higher is better
                </button>
                <button
                  type="button"
                  onClick={() => setNrsDirection('lowerIsBetter')}
                  className={`flex-1 rounded-[var(--radius-button)] border px-3 py-2.5 text-[14px] font-semibold ${
                    nrsDirection === 'lowerIsBetter'
                      ? 'border-sage bg-sage-soft text-sage-deep'
                      : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
                  }`}
                >
                  Lower is better
                </button>
              </div>
            </Field>

            <Field
              label="GAS outcome levels"
              helper="Set the highest NRS answer that counts as each outcome. The patient's weekly 0-10 answer falls into the matching level."
            >
              <GasCutPoints
                direction={nrsDirection}
                cutLowLow={cutLowLow}
                cutLow={cutLow}
                cutZero={cutZero}
                cutHigh={cutHigh}
                onChange={(which, v) => {
                  if (which === 'lowLow') setCutLowLow(v);
                  else if (which === 'low') setCutLow(v);
                  else if (which === 'zero') setCutZero(v);
                  else setCutHigh(v);
                }}
              />
              {!cutsValid && (cutLowLow || cutLow || cutZero || cutHigh) && (
                <p className="mt-2 text-[14px] text-amber-deep">
                  Each NRS cut-off must be a whole number from 0 to 9,
                  and each one higher than the one above it.
                </p>
              )}
            </Field>

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={() => setShowApproveForm(false)}
                className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
              >
                {tApprove('cancel')}
              </button>
              <button
                type="button"
                onClick={submitApprove}
                disabled={!canSubmitApprove || approve.isPending}
                className="flex h-12 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-muted"
              >
                {approve.isPending ? '…' : tApprove('submit')}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Row({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[14px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  primary
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] px-5 text-[15px] font-semibold ${
        primary
          ? 'bg-sage-deep text-on-accent hover:bg-ink-soft'
          : 'border border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
      }`}
    >
      {children}
    </button>
  );
}

const inputClasses =
  'mt-2 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none';

function Field({
  label,
  helper,
  children
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-7">
      <label className="block text-[14px] font-semibold text-ink">
        {label}
      </label>
      {helper && (
        <p className="mt-1 text-[14px] text-ink-muted">{helper}</p>
      )}
      {children}
    </div>
  );
}


