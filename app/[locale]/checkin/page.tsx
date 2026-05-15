'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useStore, actions } from '@/lib/store';
import { useCheckinDraft, checkinDraftStorage } from '@/lib/useCheckinDraft';
import { isCheckinComplete } from '@/lib/checkinDraft';
import { WizardLayout } from '@/components/wizard/WizardLayout';
import { GoalRatingPicker } from '@/components/wizard/GoalRatingPicker';

/**
 * Weekly check-in wizard. Lives at /checkin (or /<locale>/checkin).
 *
 * Step plan:
 *   1..N — one step per active goal, rating with the 5 goal-specific
 *          GAS anchors. Middle option is visually highlighted but not
 *          labelled as "expected" — the goal-specific text carries the
 *          meaning.
 *   N+1  — optional comment field with safety nudge + summary review.
 *
 * If the patient has no active goals or no pending prompt, the page
 * redirects home. (The home screen guards against navigating here in
 * that case, but the check is repeated here in case of direct URL access.)
 */
export default function CheckinPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('patient.checkin');
  const state = useStore();

  const patient = state.patients.find((p) => p.id === state.currentPatientId);
  const cycle = patient
    ? state.treatmentCycles.find((c) => c.id === patient.activeTreatmentCycleId)
    : undefined;

  // Find the pending prompt for this cycle (latest by week number).
  const pendingPrompt = cycle
    ? state.weeklyPrompts
        .filter((p) => p.treatmentCycleId === cycle.id && p.status === 'pending')
        .sort((a, b) => b.weekNumber - a.weekNumber)[0]
    : undefined;

  // Active goals for the patient/cycle.
  const activeGoals = patient && cycle
    ? state.approvedGoals
        .filter(
          (g) =>
            g.patientId === patient.id &&
            g.treatmentCycleId === cycle.id &&
            g.status === 'active'
        )
        .sort((a, b) => a.approvedAt.localeCompare(b.approvedAt))
    : [];

  const homePath = locale === 'en' ? '/' : `/${locale}`;
  const goHome = () => router.push(homePath);

  // Redirect home if any of the preconditions are missing.
  useEffect(() => {
    if (!patient || !cycle || !pendingPrompt || activeGoals.length === 0) {
      router.replace(homePath);
    }
  }, [patient, cycle, pendingPrompt, activeGoals.length, router, homePath]);

  // Hooks must be called unconditionally, so we feed safe fallbacks when
  // the redirect is about to fire.
  const safePatient = patient ?? {
    id: 'placeholder',
    activeTreatmentCycleId: 'placeholder'
  };
  const safePrompt = pendingPrompt ?? { id: 'placeholder', weekNumber: 0 };

  const { draft, update, setRating, goToStep, reset, hydrated } =
    useCheckinDraft({
      patient: safePatient,
      prompt: safePrompt
    });

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  if (!patient || !cycle || !pendingPrompt || activeGoals.length === 0) {
    return null;
  }

  // Step bookkeeping --------------------------------------------------
  //
  // Steps 1..activeGoals.length  → goal rating step for goal[i-1]
  // Last step (= length + 1)     → comment + summary
  const totalSteps = activeGoals.length + 1;
  const step = Math.min(Math.max(draft.currentStep, 1), totalSteps);
  const isLastStep = step === totalSteps;

  // Whether the current step's input is in a state that allows advancing.
  const currentStepComplete = (() => {
    if (isLastStep) {
      // Last step requires all goals rated (comment is optional).
      return isCheckinComplete(draft, activeGoals.map((g) => g.id));
    }
    const goal = activeGoals[step - 1];
    return typeof draft.ratings[goal.id] === 'number';
  })();

  // Submitted view ----------------------------------------------------
  if (submittedId) {
    return <ThanksView onBackHome={goHome} />;
  }

  const hasContent =
    Object.keys(draft.ratings).length > 0 ||
    Boolean(draft.comment?.trim());

  const onCancel = () => {
    if (hasContent) {
      setShowCancelConfirm(true);
    } else {
      goHome();
    }
  };

  const goNext = () => {
    if (step < totalSteps) {
      goToStep(step + 1);
    } else {
      doSubmit();
    }
  };

  const goBack = () => {
    if (step > 1) goToStep(step - 1);
  };

 const doSubmit = () => {
    if (!isCheckinComplete(draft, activeGoals.map((g) => g.id))) return;
    // Set the submitted state FIRST so the thanks view renders on the
    // next pass, before the store update causes the prompt to disappear
    // and the redirect-when-no-prompt effect fires.
    setSubmittedId('pending');
    const id = actions.submitCheckin(draft);
    if (id) {
      checkinDraftStorage.clear(pendingPrompt.id);
      reset();
      setSubmittedId(id);
    } else {
      // Submit failed — undo the optimistic flag.
      setSubmittedId(null);
    }
  };

  // Step body ---------------------------------------------------------
  let title = '';
  let helper = '';
  let body = null;

  if (!isLastStep) {
    const goal = activeGoals[step - 1];
    title = t('rateGoalTitle');
    helper = t('rateGoalHelper');
    body = (
      <GoalRatingPicker
        ariaLabel={`${goal.patientFacingText} — ${title}`}
        goalText={goal.patientFacingText}
        anchors={goal.gasAnchors}
        value={draft.ratings[goal.id] as -2 | -1 | 0 | 1 | 2 | undefined}
        onChange={(v) => setRating(goal.id, v)}
      />
    );
  } else {
    title = t('commentTitle');
    helper = t('commentHelper');
    body = (
      <>
        <label htmlFor="comment" className="sr-only">
          {title}
        </label>
        <textarea
          id="comment"
          value={draft.comment ?? ''}
          onChange={(e) => update({ comment: e.target.value })}
          placeholder={t('commentPlaceholder')}
          rows={4}
          className="block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-3 text-[16px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
          maxLength={500}
        />
        <p className="mt-2 text-[13px] text-ink-muted">
          {t('commentSafetyNote')}
        </p>

        {/* Summary card */}
        <section className="mt-8 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5">
          <h2 className="font-display text-[18px] text-ink">
            {t('summaryTitle')}
          </h2>
          <p className="mt-1 text-[14px] text-ink-soft">{t('summaryBody')}</p>

          <dl className="mt-4 space-y-3 text-[14px]">
            {activeGoals.map((g, i) => {
              const rating = draft.ratings[g.id];
              let answer = '—';
              if (typeof rating === 'number') {
                if (rating === -2) answer = g.gasAnchors.minus2;
                else if (rating === -1) answer = g.gasAnchors.minus1;
                else if (rating === 0) answer = g.gasAnchors.zero;
                else if (rating === 1) answer = g.gasAnchors.plus1;
                else if (rating === 2) answer = g.gasAnchors.plus2;
              }
              return (
                <SummaryRow
                  key={g.id}
                  label={g.patientFacingText}
                  value={answer}
                  onEdit={() => goToStep(i + 1)}
                  editLabel={t('summaryEdit')}
                />
              );
            })}
            {draft.comment && draft.comment.trim() && (
              <SummaryRow
                label={t('summaryCommentLabel')}
                value={draft.comment.trim()}
                onEdit={() => goToStep(totalSteps)}
                editLabel={t('summaryEdit')}
              />
            )}
          </dl>
        </section>
      </>
    );
  }

  return (
    <>
      <WizardLayout
        currentStep={step}
        totalSteps={totalSteps}
        title={title}
        helper={helper}
        onBack={step > 1 ? goBack : undefined}
        onCancel={onCancel}
        primaryAction={{
          label: isLastStep ? t('submit') : t('next'),
          onClick: goNext,
          disabled: !currentStepComplete
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
        <dt className="text-[12px] font-semibold text-ink-soft">{label}</dt>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-[13px] font-semibold text-sage-deep hover:underline"
        >
          {editLabel}
        </button>
      </div>
      <dd className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
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
  const t = useTranslations('patient.checkin');
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
  const t = useTranslations('patient.checkin');
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
          {t('thanksTitle')}
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
          {t('thanksBody')}
        </p>
        <button
          type="button"
          onClick={onBackHome}
          className="mt-8 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-cream-soft hover:bg-ink-soft"
        >
          {t('thanksBackHome')}
        </button>
      </main>
    </div>
  );
}
