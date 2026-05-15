'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useStore, actions } from '@/lib/store';
import { formatLongDate } from '@/lib/dates';
import { useSessionTimeout } from '@/lib/useSessionTimeout';

/**
 * Clinician's suggestion review screen.
 *
 *   /clinician/suggestion?id=<suggestion-id>
 *
 * Top half: read-only display of the patient's submission.
 * Bottom half: action buttons (defer / combine / not suitable / approve).
 *
 * Picking "Approve" or "Edit and approve" reveals the approval form
 * inline — patient-facing text, SMART text, five GAS anchors — so the
 * clinician sees the suggestion they're approving WHILE they write it.
 */
export default function SuggestionReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations('clinician.review');
  const tApprove = useTranslations('clinician.approve');
  const tDomain = useTranslations('domain');
  const tImportance = useTranslations('importance');
  const state = useStore();

  const session = state.clinicianSession;
  const id = searchParams.get('id') ?? '';

  useSessionTimeout({
    onTimeout: () => {
      actions.endClinicianSession();
      router.replace(
        locale === 'en' ? '/clinician' : `/${locale}/clinician`
      );
    }
  });

  useEffect(() => {
    if (!session) {
      router.replace(
        locale === 'en' ? '/clinician' : `/${locale}/clinician`
      );
    }
  }, [session, router, locale]);

  const suggestion = state.goalSuggestions.find((s) => s.id === id);
  const patientHomePath =
    locale === 'en' ? '/clinician/patient' : `/${locale}/clinician/patient`;

  useEffect(() => {
    if (session && !suggestion) {
      // Bad id — back to patient view.
      router.replace(patientHomePath);
    }
  }, [session, suggestion, router, patientHomePath]);

  // Approval form fields
  const [showApproveForm, setShowApproveForm] = useState(false);
  const [patientText, setPatientText] = useState('');
  const [smartText, setSmartText] = useState('');
  const [anchorM2, setAnchorM2] = useState('');
  const [anchorM1, setAnchorM1] = useState('');
  const [anchorZ, setAnchorZ] = useState('');
  const [anchorP1, setAnchorP1] = useState('');
  const [anchorP2, setAnchorP2] = useState('');

  if (!session || !suggestion) return null;

  const patient = state.patients.find((p) => p.id === session.patientId);
  if (!patient) return null;

  // Action handlers ---------------------------------------------------
  const back = () => router.push(patientHomePath);

  const onDefer = () => {
    actions.setSuggestionStatus(suggestion.id, 'discussAtNextVisit');
    actions.touchClinicianSession();
    back();
  };
  const onCombine = () => {
    actions.setSuggestionStatus(suggestion.id, 'combinedWithAnother');
    actions.touchClinicianSession();
    back();
  };
  const onNotSuitable = () => {
    actions.setSuggestionStatus(suggestion.id, 'notSuitableThisCycle');
    actions.touchClinicianSession();
    back();
  };

  const startApprove = (prefilled: boolean) => {
    if (prefilled) {
      // "Approve" — pre-fill patient text from the patient's own words.
      setPatientText(suggestion.patientWording);
    }
    setShowApproveForm(true);
  };

  const canSubmitApprove =
    patientText.trim() &&
    smartText.trim() &&
    anchorM2.trim() &&
    anchorM1.trim() &&
    anchorZ.trim() &&
    anchorP1.trim() &&
    anchorP2.trim();

  const submitApprove = () => {
    if (!canSubmitApprove) return;
    actions.approveSuggestion(suggestion.id, {
      patientFacingText: patientText,
      smartText,
      gasAnchors: {
        minus2: anchorM2,
        minus1: anchorM1,
        zero: anchorZ,
        plus1: anchorP1,
        plus2: anchorP2
      }
    });
    actions.touchClinicianSession();
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
          <span className="w-10" aria-hidden />
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-5 pb-16 pt-6">
        {/* Read-only suggestion summary */}
        <section className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5">
          <dl className="space-y-3 text-[14px]">
            <Row label={t('patientWordsLabel')}>
              <p className="font-display text-[18px] leading-snug text-ink">
                "{suggestion.patientWording}"
              </p>
            </Row>
            <Row label={t('areaLabel')}>
              <p>{tDomain(suggestion.domain)}</p>
            </Row>
            <Row label={t('importanceLabel')}>
              <p>{tImportance(suggestion.importance)}</p>
            </Row>
            {suggestion.difficultyContext && (
              <Row label={t('contextLabel')}>
                <p className="whitespace-pre-wrap">
                  {suggestion.difficultyContext}
                </p>
              </Row>
            )}
            <Row label={t('submittedLabel')}>
              <p className="text-ink-soft">
                {formatLongDate(suggestion.createdAt.slice(0, 10), locale)}
              </p>
            </Row>
          </dl>
        </section>

        {/* Action buttons or approval form */}
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
          <ApproveForm
            t={tApprove}
            patientText={patientText}
            setPatientText={setPatientText}
            smartText={smartText}
            setSmartText={setSmartText}
            anchorM2={anchorM2}
            setAnchorM2={setAnchorM2}
            anchorM1={anchorM1}
            setAnchorM1={setAnchorM1}
            anchorZ={anchorZ}
            setAnchorZ={setAnchorZ}
            anchorP1={anchorP1}
            setAnchorP1={setAnchorP1}
            anchorP2={anchorP2}
            setAnchorP2={setAnchorP2}
            canSubmit={Boolean(canSubmitApprove)}
            onCancel={() => setShowApproveForm(false)}
            onSubmit={submitApprove}
          />
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

interface ApproveFormProps {
  t: (key: string) => string;
  patientText: string;
  setPatientText: (v: string) => void;
  smartText: string;
  setSmartText: (v: string) => void;
  anchorM2: string;
  setAnchorM2: (v: string) => void;
  anchorM1: string;
  setAnchorM1: (v: string) => void;
  anchorZ: string;
  setAnchorZ: (v: string) => void;
  anchorP1: string;
  setAnchorP1: (v: string) => void;
  anchorP2: string;
  setAnchorP2: (v: string) => void;
  canSubmit: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

function ApproveForm(p: ApproveFormProps) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-[20px] leading-tight text-ink">
        {p.t('title')}
      </h2>
      <p className="mt-2 rounded-[var(--radius-button)] border border-stone bg-cream-soft p-3 text-[13px] leading-relaxed text-ink-soft">
        {p.t('headerNote')}
      </p>

      <Field
        label={p.t('patientTextLabel')}
        helper={p.t('patientTextHelper')}
      >
        <input
          type="text"
          value={p.patientText}
          onChange={(e) => p.setPatientText(e.target.value)}
          className={inputClasses}
          maxLength={120}
        />
      </Field>

      <Field label={p.t('smartLabel')} helper={p.t('smartHelper')}>
        <textarea
          value={p.smartText}
          onChange={(e) => p.setSmartText(e.target.value)}
          rows={3}
          className={inputClasses}
          maxLength={400}
        />
      </Field>

      <h3 className="mt-8 font-display text-[17px] text-ink">
        {p.t('anchorsTitle')}
      </h3>

      <AnchorField
        label={p.t('anchorMinus2')}
        value={p.anchorM2}
        onChange={p.setAnchorM2}
        placeholder={p.t('anchorPlaceholder')}
      />
      <AnchorField
        label={p.t('anchorMinus1')}
        value={p.anchorM1}
        onChange={p.setAnchorM1}
        placeholder={p.t('anchorPlaceholder')}
      />
      <AnchorField
        label={p.t('anchorZero')}
        value={p.anchorZ}
        onChange={p.setAnchorZ}
        placeholder={p.t('anchorPlaceholder')}
        emphasised
      />
      <AnchorField
        label={p.t('anchorPlus1')}
        value={p.anchorP1}
        onChange={p.setAnchorP1}
        placeholder={p.t('anchorPlaceholder')}
      />
      <AnchorField
        label={p.t('anchorPlus2')}
        value={p.anchorP2}
        onChange={p.setAnchorP2}
        placeholder={p.t('anchorPlaceholder')}
      />

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={p.onCancel}
          className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
        >
          {p.t('cancel')}
        </button>
        <button
          type="button"
          onClick={p.onSubmit}
          disabled={!p.canSubmit}
          className="flex h-12 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-cream-soft hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-muted"
        >
          {p.t('submit')}
        </button>
      </div>
    </section>
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
