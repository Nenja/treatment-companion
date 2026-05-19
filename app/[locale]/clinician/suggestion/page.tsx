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
import { AccountMenu } from '@/components/layout/AccountMenu';

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
  const [aM2, setAM2] = useState('');
  const [aM1, setAM1] = useState('');
  const [aZ, setAZ] = useState('');
  const [aP1, setAP1] = useState('');
  const [aP2, setAP2] = useState('');

  if (
    authLoading ||
    !profile ||
    profile.role !== 'clinician' ||
    sessionQuery.isLoading ||
    !sessionQuery.data ||
    suggestionQuery.isLoading
  ) {
    return <div className="min-h-dvh bg-cream" />;
  }

  if (!suggestionQuery.data) {
    // Bad id or no access — go back to patient view.
    router.replace(patientHomePath);
    return <div className="min-h-dvh bg-cream" />;
  }

  const suggestion = suggestionQuery.data;
  const back = () => router.push(patientHomePath);

  const onDefer = async () => {
    await setStatus.mutateAsync({
      suggestionId: suggestion.id,
      status: 'discussAtNextVisit'
    });
    touchSession.mutate();
    back();
  };
  const onCombine = async () => {
    await setStatus.mutateAsync({
      suggestionId: suggestion.id,
      status: 'combinedWithAnother'
    });
    touchSession.mutate();
    back();
  };
  const onNotSuitable = async () => {
    await setStatus.mutateAsync({
      suggestionId: suggestion.id,
      status: 'notSuitableThisCycle'
    });
    touchSession.mutate();
    back();
  };

  const startApprove = (prefilled: boolean) => {
    if (prefilled) setPatientText(suggestion.patient_wording as string);
    setShowApproveForm(true);
  };

  const canSubmitApprove =
    patientText.trim() &&
    smartText.trim() &&
    aM2.trim() &&
    aM1.trim() &&
    aZ.trim() &&
    aP1.trim() &&
    aP2.trim();

  const submitApprove = async () => {
    if (!canSubmitApprove || approve.isPending) return;
    await approve.mutateAsync({
      suggestionId: suggestion.id,
      patientFacingText: patientText,
      smartText,
      anchors: {
        minus2: aM2,
        minus1: aM1,
        zero: aZ,
        plus1: aP1,
        plus2: aP2
      }
    });
    touchSession.mutate();
    back();
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
            <p className="mt-2 rounded-[var(--radius-button)] border border-stone bg-cream-soft p-3 text-[13px] leading-relaxed text-ink-soft">
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
              {tApprove('anchorsTitle')}
            </h3>

            <AnchorField
              label={tApprove('anchorMinus2')}
              value={aM2}
              onChange={setAM2}
              placeholder={tApprove('anchorPlaceholder')}
            />
            <AnchorField
              label={tApprove('anchorMinus1')}
              value={aM1}
              onChange={setAM1}
              placeholder={tApprove('anchorPlaceholder')}
            />
            <AnchorField
              label={tApprove('anchorZero')}
              value={aZ}
              onChange={setAZ}
              placeholder={tApprove('anchorPlaceholder')}
              emphasised
            />
            <AnchorField
              label={tApprove('anchorPlus1')}
              value={aP1}
              onChange={setAP1}
              placeholder={tApprove('anchorPlaceholder')}
            />
            <AnchorField
              label={tApprove('anchorPlus2')}
              value={aP2}
              onChange={setAP2}
              placeholder={tApprove('anchorPlaceholder')}
            />

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
                className="flex h-12 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-cream-soft hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-muted"
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
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
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
          ? 'bg-sage-deep text-cream-soft hover:bg-ink-soft'
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
    <div className="mt-6">
      <label className="block text-[14px] font-semibold text-ink">
        {label}
      </label>
      {helper && (
        <p className="mt-0.5 text-[12px] text-ink-muted">{helper}</p>
      )}
      {children}
    </div>
  );
}

function AnchorField({
  label,
  value,
  onChange,
  placeholder,
  emphasised
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  emphasised?: boolean;
}) {
  return (
    <div
      className={`mt-3 rounded-[var(--radius-button)] border p-3 ${
        emphasised
          ? 'border-sage/40 bg-sage-soft/30 border-l-[3px] border-l-sage'
          : 'border-stone bg-cream-soft'
      }`}
    >
      <label
        className={`block text-[11px] font-semibold uppercase tracking-wider ${
          emphasised ? 'text-sage-deep' : 'text-ink-muted'
        }`}
      >
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="mt-1 block w-full resize-none border-none bg-transparent p-0 text-[14px] leading-relaxed text-ink placeholder:text-ink-muted focus:outline-none"
        maxLength={200}
      />
    </div>
  );
}
