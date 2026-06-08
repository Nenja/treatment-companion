'use client';

import { Suspense, useEffect, useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
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
  useApproveSuggestionGas,
  useSetSuggestionStatus
} from '@/lib/supabase/clinicianPatient';
import { formatLongDate } from '@/lib/dates';
import type { NrsDirection } from '@/lib/types';
import { EndSessionButton } from '@/components/clinician/EndSessionButton';
import { isSessionEndingDeliberately } from '@/lib/sessionEndSignal';
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
  const tA11y = useTranslations('a11y');
  const tApprove = useTranslations('clinician.approve');
  const tNewGoal = useTranslations('newGoal');
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
  const approveGas = useApproveSuggestionGas();
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
  // No session → unlock screen. Only on a SETTLED no-session result
  // (status 'success' + data null), never a transient null during a
  // background refetch — see the detailed note on the patient page.
  useEffect(() => {
    if (sessionQuery.status === 'success' && sessionQuery.data === null) {
      if (isSessionEndingDeliberately()) return;
      router.replace(
        (locale === 'en' ? '/clinician' : `/${locale}/clinician`) +
          '?timeout=1'
      );
    }
  }, [sessionQuery.status, sessionQuery.data, router, locale]);

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
  // NRS goals are tracked as a raw 0–10 score (no clinician-set
  // cut-offs). A suggestion can also be approved as a GAS goal.
  const [goalKind, setGoalKind] = useState<'nrs' | 'gas'>('nrs');
  const [anchorMinus2, setAnchorMinus2] = useState('');
  const [anchorMinus1, setAnchorMinus1] = useState('');
  const [anchorZero, setAnchorZero] = useState('');
  const [anchorPlus1, setAnchorPlus1] = useState('');
  const [anchorPlus2, setAnchorPlus2] = useState('');

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
        <AppHeader width="narrow" />
        <main className="mx-auto max-w-[480px] px-5 pb-16 pt-6">
          <SkeletonScreen label={tA11y('loading')}>
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

  const anchorsValid = Boolean(
    anchorMinus2.trim() &&
      anchorMinus1.trim() &&
      anchorZero.trim() &&
      anchorPlus1.trim() &&
      anchorPlus2.trim()
  );

  const approveStarted =
    patientText.trim() !== '' ||
    smartText.trim() !== '' ||
    nrsQuestion.trim() !== '' ||
    anchorMinus2.trim() !== '' ||
    anchorMinus1.trim() !== '' ||
    anchorZero.trim() !== '' ||
    anchorPlus1.trim() !== '' ||
    anchorPlus2.trim() !== '';
  const approveMissing: string[] = [];
  if (!patientText.trim()) approveMissing.push(tApprove('needGoalText'));
  if (!smartText.trim()) approveMissing.push(tApprove('needSmart'));
  if (goalKind === 'nrs') {
    if (!nrsQuestion.trim()) approveMissing.push(tApprove('needNrsQuestion'));
  } else if (!anchorsValid) {
    approveMissing.push(tApprove('needAnchors'));
  }

  const canSubmitApprove = Boolean(
    patientText.trim() &&
      smartText.trim() &&
      (goalKind === 'nrs' ? nrsQuestion.trim() : anchorsValid) &&
      !approve.isPending &&
      !approveGas.isPending
  );

  const submitApprove = async () => {
    if (!canSubmitApprove || approve.isPending || approveGas.isPending) return;
    try {
      if (goalKind === 'nrs') {
        await approve.mutateAsync({
          suggestionId: suggestion.id,
          patientFacingText: patientText,
          smartText,
          nrsQuestion,
          nrsDirection
        });
      } else {
        await approveGas.mutateAsync({
          suggestionId: suggestion.id,
          patientFacingText: patientText,
          smartText,
          anchors: {
            minus2: anchorMinus2.trim(),
            minus1: anchorMinus1.trim(),
            zero: anchorZero.trim(),
            plus1: anchorPlus1.trim(),
            plus2: anchorPlus2.trim()
          }
        });
      }
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
      <AppHeader
        width="narrow"
        back={{ label: t('back'), onClick: back }}
        middle={
          <span className="eyebrow block truncate text-center">{t('title')}</span>
        }
        actions={<EndSessionButton role="clinician" />}
        helpPageKey="suggestion"
      />

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

            <Field label={tApprove('modelLabel')}>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setGoalKind('nrs')}
                  className={`flex-1 rounded-[var(--radius-button)] border px-3 py-2.5 text-[14px] font-semibold ${
                    goalKind === 'nrs'
                      ? 'border-sage bg-sage-soft text-sage-deep'
                      : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
                  }`}
                >
                  {tApprove('modelNrs')}
                </button>
                <button
                  type="button"
                  onClick={() => setGoalKind('gas')}
                  className={`flex-1 rounded-[var(--radius-button)] border px-3 py-2.5 text-[14px] font-semibold ${
                    goalKind === 'gas'
                      ? 'border-sage bg-sage-soft text-sage-deep'
                      : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
                  }`}
                >
                  {tApprove('modelGas')}
                </button>
              </div>
            </Field>

            {goalKind === 'nrs' && (
              <>
                <h3 className="mt-8 font-display text-[17px] text-ink">
                  {tApprove('nrsSetupHeading')}
                </h3>
                <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
                  {tApprove('nrsScaleIntro')}
                </p>

                <Field
                  label={tApprove('nrsQuestionLabel')}
                  helper={tApprove('nrsQuestionHelper')}
                >
                  <textarea
                    value={nrsQuestion}
                    onChange={(e) => setNrsQuestion(e.target.value)}
                    rows={3}
                    placeholder={tApprove('nrsQuestionPlaceholder')}
                    className={inputClasses}
                    maxLength={300}
                  />
                </Field>

                <Field
                  label={tApprove('directionLabel')}
                  helper={tApprove('directionHelper')}
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
                      {tApprove('higherIsBetter')}
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
                      {tApprove('lowerIsBetter')}
                    </button>
                  </div>
                </Field>
              </>
            )}

            {goalKind === 'gas' && (
              <Field
                label={tNewGoal('gasLevelsLabel')}
                helper={tNewGoal('gasLevelsHelp')}
              >
                <div className="mt-2 space-y-2">
                  {(
                    [
                      ['levelMuchMore', anchorPlus2, setAnchorPlus2],
                      ['levelMore', anchorPlus1, setAnchorPlus1],
                      ['levelExpected', anchorZero, setAnchorZero],
                      ['levelLess', anchorMinus1, setAnchorMinus1],
                      ['levelMuchLess', anchorMinus2, setAnchorMinus2]
                    ] as const
                  ).map(([key, val, setVal]) => (
                    <div key={key}>
                      <label className="block text-[13px] font-semibold text-ink-soft">
                        {tNewGoal(key)}
                      </label>
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                        placeholder={tNewGoal(`${key}Placeholder`)}
                        className={inputClasses}
                        maxLength={200}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[13px] text-ink-muted">
                  {tNewGoal('gasTip')}
                </p>
              </Field>
            )}

            {!canSubmitApprove && approveStarted && approveMissing.length > 0 && (
              <div className="mt-6 rounded-[var(--radius-button)] border border-stone bg-cream px-4 py-3">
                <p className="text-[13px] font-semibold text-ink-soft">
                  {tApprove('stillNeededTitle')}
                </p>
                <ul className="mt-1 list-disc pl-5 text-[13px] text-ink-soft">
                  {approveMissing.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
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
                disabled={!canSubmitApprove}
                className="flex h-12 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-soft"
              >
                {approve.isPending || approveGas.isPending
                  ? '…'
                  : tApprove('submit')}
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


