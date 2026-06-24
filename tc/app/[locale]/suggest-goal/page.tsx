'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useSubmitSuggestion } from '@/lib/supabase/suggestGoal';
import { useSuggestGoalDraft, draftStorage } from '@/lib/useSuggestGoalDraft';
import {
  GOAL_DOMAINS,
  IMPORTANCE_LEVELS,
  type GoalDomain,
  type Importance
} from '@/lib/types';
import {
  isStepComplete,
  canSubmit,
  type WizardStep
} from '@/lib/suggestGoalDraft';
import { classifyError } from '@/lib/feedback';
import { useToast } from '@/components/feedback/Toast';
import { useModalA11y } from '@/lib/useModalA11y';
import {
  SkeletonBlock,
  SkeletonScreen
} from '@/components/feedback/Skeleton';
import { WizardLayout } from '@/components/wizard/WizardLayout';
import { OptionList, ExamplesBlock } from '@/components/wizard/OptionList';

const TOTAL_STEPS = 4;

/**
 * Suggest-goal wizard. Lives at /suggest-goal (or /da/suggest-goal).
 *
 * Four steps, draft auto-saved to localStorage per patient. The patient
 * can cancel and resume any time without losing what they wrote.
 *
 * Step plan:
 *   1. Domain — which area of life
 *   2. Patient wording — open description
 *   3. Importance — three-option scale
 *   4. Optional extra context + summary review
 *
 * The previous "when do you hope to notice a change" question was removed
 * because goals are scoped to the treatment cycle, which already has a
 * defined length. Asking the patient for a timeframe created a mismatch
 * between their expectation and how the system actually reviews goals.
 */
export default function SuggestGoalPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('patient.suggestGoal');
  const tA11y = useTranslations('a11y');
  const tDomain = useTranslations('domain');
  const tImportance = useTranslations('importance');
  const { user, profile, loading: authLoading } = useAuth();
  const submit = useSubmitSuggestion();
  const toast = useToast();
  const tFeedback = useTranslations('feedback');

  // Use the profile id as the draft key. localStorage drafts survive
  // tab close/reopen but are scoped to the signed-in user.
  const { draft, update, goToStep, reset, hydrated } = useSuggestGoalDraft(
    profile?.id ?? ''
  );

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  // Auth gating: must be a patient to submit suggestions.
  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) {
      router.replace(locale === 'en' ? '/login' : `/${locale}/login`);
      return;
    }
    if (profile.role !== 'patient') {
      router.replace(locale === 'en' ? '/' : `/${locale}`);
    }
  }, [authLoading, user, profile, router, locale]);

  if (authLoading || !user || !profile || profile.role !== 'patient' || !hydrated) {
    return <SuggestGoalSkeleton />;
  }

  const homePath = locale === 'en' ? '/' : `/${locale}`;
  const goHome = () => router.push(homePath);

  // --- Cancel handling -------------------------------------------------
  const hasContent =
    Boolean(draft.domain) ||
    Boolean(draft.patientWording?.trim()) ||
    Boolean(draft.importance) ||
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
  // Defensive: clamp current step so any old persisted draft pointing at
  // step 5 lands on the new final step (4) instead.
  const step = (Math.min(draft.currentStep, TOTAL_STEPS) as WizardStep);

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

  const doSubmit = async () => {
    if (!canSubmit(draft)) return;
    if (submit.isPending) return;
    try {
      const id = await submit.mutateAsync({
        domain: draft.domain!,
        otherDomainText: draft.otherDomainText,
        patientWording: draft.patientWording!,
        importance: draft.importance!,
        difficultyContext: draft.difficultyContext
      });
      draftStorage.clear(profile.id);
      reset();
      setSubmittedId(id);
      toast.success(tFeedback('successSuggestion'));
    } catch (err) {
      // Stay on the page so the patient can retry. The button label
      // shows "Submit" again automatically because isPending resets.
      console.error('submit suggestion failed', err);
      toast.error(tFeedback(classifyError(err)));
    }
  };

  const stepComplete = isStepComplete(draft, step);
  const isLastStep = step === TOTAL_STEPS;
  const primaryLabel = isLastStep
    ? submit.isPending
      ? '…'
      : t('submit')
    : t('next');
  const primaryDisabled = isLastStep
    ? !canSubmit(draft) || submit.isPending
    : !stepComplete;

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
  } else {
    // Step 4: optional context + summary
    title = t('step4.title');
    helper = t('step4.helper');
    body = (
      <>
        <label htmlFor="difficultyContext" className="sr-only">
          {title}
        </label>
        <textarea
          id="difficultyContext"
          value={draft.difficultyContext ?? ''}
          onChange={(e) => update({ difficultyContext: e.target.value })}
          placeholder={t('step4.placeholder')}
          rows={4}
          className="block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-3 text-[16px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
          maxLength={500}
        />

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
        <dt className="text-[14px] font-semibold uppercase tracking-wider text-ink-muted">
          {label}
        </dt>
        <button
          type="button"
          onClick={onEdit}
          className="text-[14px] font-semibold text-sage-deep hover:underline"
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
  // Esc on this dialog means "keep editing" — closing the dialog
  // without discarding the draft. Discarding is an explicit choice.
  const containerRef = useModalA11y(onKeep);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-confirm-title"
        className="w-full max-w-[400px] rounded-[var(--radius-card)] border border-stone bg-cream p-6 shadow-xl"
      >
        <h2 id="cancel-confirm-title" className="font-display text-[20px] text-ink">
          {t('cancelConfirmTitle')}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          {t('cancelConfirmBody')}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onKeep}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft"
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
          className="mt-8 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft"
        >
          {t('backHome')}
        </button>
      </main>
    </div>
  );
}

/**
 * Loading skeleton for the suggest-goal wizard. Shape matches the
 * wizard layout (header + heading + body + sticky bottom button).
 */
function SuggestGoalSkeleton() {
  const tA11y = useTranslations('a11y');
  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className="mx-auto flex max-w-[480px] items-center justify-between px-5 py-4">
          <SkeletonBlock width="w-16" height="h-4" />
          <SkeletonBlock width="w-12" height="h-4" />
          <SkeletonBlock width="w-8" height="h-8" shape="rounded-full" />
        </div>
      </header>
      <main className="mx-auto max-w-[480px] px-5 pb-32 pt-6">
        <SkeletonScreen label={tA11y('loading')}>
          <SkeletonBlock width="w-3/5" height="h-7" />
          <SkeletonBlock width="w-4/5" height="h-4" className="mt-2" />
          <div className="mt-8 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonBlock
                key={i}
                width="w-full"
                height="h-14"
                shape="rounded-[var(--radius-button)]"
              />
            ))}
          </div>
        </SkeletonScreen>
      </main>
    </div>
  );
}
