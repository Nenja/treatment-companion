'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useStore, actions } from '@/lib/store';
import { useSuggestGoalDraft, draftStorage } from '@/lib/useSuggestGoalDraft';
import {
  GOAL_DOMAINS,
  IMPORTANCE_LEVELS,
  HOPED_TIMEFRAMES,
  type GoalDomain,
  type Importance,
  type HopedTimeframe
} from '@/lib/types';
import { isStepComplete, canSubmit, type WizardStep } from '@/lib/suggestGoalDraft';
import { WizardLayout } from '@/components/wizard/WizardLayout';
import { OptionList, ExamplesBlock } from '@/components/wizard/OptionList';

const TOTAL_STEPS = 5;

/**
 * Suggest-goal wizard. Lives at /suggest-goal (or /da/suggest-goal).
 *
 * Five steps, draft auto-saved to localStorage per patient. The patient
 * can cancel and resume any time without losing what they wrote.
 */
export default function SuggestGoalPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('patient.suggestGoal');
  const tDomain = useTranslations('domain');
  const tImportance = useTranslations('importance');
  const tTimeframe = useTranslations('timeframe');
  const state = useStore();

  const patient = state.patients.find((p) => p.id === state.currentPatientId);
  const { draft, update, goToStep, reset, hydrated } = useSuggestGoalDraft(
    patient?.id ?? ''
  );

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // Set when the patient has successfully submitted; switches to thanks view.
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  // If for some reason there's no patient (e.g. dev panel state cleared),
  // bail back to home.
  useEffect(() => {
    if (hydrated && !patient) {
      router.replace(locale === 'en' ? '/' : `/${locale}`);
    }
  }, [hydrated, patient, router, locale]);

  if (!patient) return null;

  const homePath = locale === 'en' ? '/' : `/${locale}`;
  const goHome = () => router.push(homePath);

  // --- Cancel handling -------------------------------------------------
  const hasContent =
    Boolean(draft.domain) ||
    Boolean(draft.patientWording?.trim()) ||
    Boolean(draft.importance) ||
    Boolean(draft.hopedTimeframe) ||
    Boolean(draft.difficultyContext?.trim());

  const onCancel = () => {
    if (hasContent) {
      setShowCancelConfirm(true);
    } else {
      goHome();
    }
  };

  // --- Submitted state -------------------------------------------------
  if (submittedId) {
    return <ThanksView onBackHome={goHome} />;
  }

  // --- Step rendering --------------------------------------------------
  const step = draft.currentStep;

  const goNext = () => {
    if (step < TOTAL_STEPS) {
      goToStep((step + 1) as WizardStep);
    } else {
      doSubmit();
    }
  };

  const goBack = () => {
    if (step > 1) goToStep((step - 1) as WizardStep);
  };

  const doSubmit = () => {
    if (!canSubmit(draft)) return;
    const id = actions.submitGoalSuggestion(draft);
    if (id) {
      draftStorage.clear(patient.id);
      reset();
      setSubmittedId(id);
    }
  };

  const stepComplete = isStepComplete(draft, step);
  const isLastStep = step === TOTAL_STEPS;
  const primaryLabel = isLastStep ? t('submit') : t('next');
  const primaryDisabled = isLastStep ? !canSubmit(draft) : !stepComplete;

  // Step bodies --------------------------------------------------------

  let title = '';
  let helper = '';
  let body = null;

  if (step === 1) {
    title = t('step1.title');
    helper = t('step1.helper');
    body = (
      <>
        <OptionList<GoalDomain>
          name="domain"
          ariaLabel={title}
          value={draft.domain}
          onChange={(v) => update({ domain: v })}
          options={GOAL_DOMAINS.map((d) => ({
            value: d,
            label: tDomain(d)
          }))}
        />
        {draft.domain === 'other' && (
          <div className="mt-4">
            <label
              htmlFor="otherDomain"
              className="block text-[14px] font-semibold text-ink"
            >
              {t('step1.otherLabel')}
            </label>
            <input
              id="otherDomain"
              type="text"
              value={draft.otherDomainText ?? ''}
              onChange={(e) => update({ otherDomainText: e.target.value })}
              placeholder={t('step1.otherPlaceholder')}
              className="mt-2 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-3 text-[16px] text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
              maxLength={60}
            />
          </div>
        )}
      </>
    );
  } else if (step === 2) {
    title = t('step2.title');
    helper = t('step2.helper');
    body = (
      <>
        <label htmlFor="patientWording" className="sr-only">
          {title}
        </label>
        <textarea
          id="patientWording"
          value={draft.patientWording ?? ''}
          onChange={(e) => update({ patientWording: e.target.value })}
          placeholder={t('step2.placeholder')}
          rows={5}
          className="block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-3 text-[16px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
          maxLength={500}
        />
        <ExamplesBlock title={t('step2.examplesTitle')}>
          <li>"{t('step2.example1')}"</li>
          <li>"{t('step2.example2')}"</li>
          <li>"{t('step2.example3')}"</li>
        </ExamplesBlock>
      </>
    );
  } else if (step === 3) {
    title = t('step3.title');
    helper = t('step3.helper');
    body = (
      <OptionList<Importance>
        name="importance"
        ariaLabel={title}
        value={draft.importance}
        onChange={(v) => update({ importance: v })}
        options={IMPORTANCE_LEVELS.map((lvl) => ({
          value: lvl,
          label: tImportance(lvl)
        }))}
      />
    );
  } else if (step === 4) {
    title = t('step4.title');
    helper = t('step4.helper');
    body = (
      <OptionList<HopedTimeframe>
        name="timeframe"
        ariaLabel={title}
        value={draft.hopedTimeframe}
        onChange={(v) => update({ hopedTimeframe: v })}
        options={HOPED_TIMEFRAMES.map((tf) => ({
          value: tf,
          label: tTimeframe(tf)
        }))}
      />
    );
  } else {
    // Step 5: optional context + summary preview
    title = t('step5.title');
    helper = t('step5.helper');
    body = (
      <>
        <label htmlFor="difficultyContext" className="sr-only">
          {title}
        </label>
        <textarea
          id="difficultyContext"
          value={draft.difficultyContext ?? ''}
          onChange={(e) => update({ difficultyContext: e.target.value })}
          placeholder={t('step5.placeholder')}
          rows={4}
          className="block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-3 text-[16px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
          maxLength={500}
        />

        {/* Summary card so the patient can review before sending */}
        <section className="mt-8 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5">
          <h2 className="font-display text-[18px] text-ink">
            {t('summary.title')}
          </h2>
          <p className="mt-1 text-[14px] text-ink-soft">{t('summary.body')}</p>

          <dl className="mt-4 space-y-3 text-[14px]">
            <SummaryRow
              label={t('summary.areaLabel')}
              value={
                draft.domain === 'other' && draft.otherDomainText
                  ? `${tDomain('other')} — ${draft.otherDomainText}`
                  : draft.domain
                  ? tDomain(draft.domain)
                  : '—'
              }
              onEdit={() => goToStep(1)}
              editLabel={t('summary.edit')}
            />
            <SummaryRow
              label={t('summary.wordsLabel')}
              value={draft.patientWording || '—'}
              onEdit={() => goToStep(2)}
              editLabel={t('summary.edit')}
            />
            <SummaryRow
              label={t('summary.importanceLabel')}
              value={draft.importance ? tImportance(draft.importance) : '—'}
              onEdit={() => goToStep(3)}
              editLabel={t('summary.edit')}
            />
            <SummaryRow
              label={t('summary.timeframeLabel')}
              value={
                draft.hopedTimeframe ? tTimeframe(draft.hopedTimeframe) : '—'
              }
              onEdit={() => goToStep(4)}
              editLabel={t('summary.edit')}
            />
          </dl>
        </section>
      </>
    );
  }

  return (
    <>
      <WizardLayout
        currentStep={step}
        totalSteps={TOTAL_STEPS}
        title={title}
        helper={helper}
        onBack={step > 1 ? goBack : undefined}
        onCancel={onCancel}
        primaryAction={{
          label: primaryLabel,
          onClick: goNext,
          disabled: primaryDisabled
        }}
      >
        {body}
      </WizardLayout>

      {showCancelConfirm && (
        <CancelConfirmDialog
          onKeep={() => setShowCancelConfirm(false)}
          onLeave={() => {
            setShowCancelConfirm(false);
            goHome();
          }}
        />
      )}
    </>
  );
}

// --- Sub-views ----------------------------------------------------------

function SummaryRow({
  label,
  value,
  onEdit,
  editLabel
}: {
  label: string;
  value: string;
  onEdit: () => void;
  editLabel: string;
}) {
  return (
    <div className="border-t border-stone pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          {label}
        </dt>
        <button
          type="button"
          onClick={onEdit}
          className="text-[13px] font-semibold text-sage-deep hover:underline"
        >
          {editLabel}
        </button>
      </div>
      <dd className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
        {value}
      </dd>
    </div>
  );
}

function CancelConfirmDialog({
  onKeep,
  onLeave
}: {
  onKeep: () => void;
  onLeave: () => void;
}) {
  const t = useTranslations('patient.suggestGoal');
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div className="w-full max-w-[400px] rounded-[var(--radius-card)] border border-stone bg-cream p-6 shadow-xl">
        <h2 className="font-display text-[20px] text-ink">
          {t('cancelConfirmTitle')}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          {t('cancelConfirmBody')}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onKeep}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-cream-soft hover:bg-ink-soft"
          >
            {t('cancelConfirmKeep')}
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {t('cancelConfirmDiscard')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ThanksView({ onBackHome }: { onBackHome: () => void }) {
  const t = useTranslations('patient.suggestGoal.thanks');
  return (
    <div className="min-h-dvh bg-cream">
      <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center px-5">
        <div
          aria-hidden
          className="mb-6 inline-flex h-14 w-14 items-center justify-center self-start rounded-full bg-sage-soft text-sage-deep"
        >
          <svg width="28" height="28" viewBox="0 0 24 24">
            <path
              d="M5 13l4 4 10-10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="font-display text-[32px] leading-tight text-ink">
          {t('title')}
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
          {t('body')}
        </p>
        <button
          type="button"
          onClick={onBackHome}
          className="mt-8 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-cream-soft hover:bg-ink-soft"
        >
          {t('backHome')}
        </button>
      </main>
    </div>
  );
}
