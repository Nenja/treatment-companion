'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useCheckinData, useSubmitCheckin } from '@/lib/supabase/checkin';
import { useCheckinDraft, checkinDraftStorage } from '@/lib/useCheckinDraft';
import { isCheckinComplete } from '@/lib/checkinDraft';
import { ratingLabelForValue } from '@/lib/types';
import { WizardLayout } from '@/components/wizard/WizardLayout';
import { GoalRatingPicker } from '@/components/wizard/GoalRatingPicker';

/**
 * Weekly check-in wizard. Lives at /checkin (or /<locale>/checkin).
 *
 * Optional ?promptId=X query param targets a specific pending prompt
 * (used when the patient taps a catch-up week from the home page).
 * Without the param, the oldest pending prompt is used.
 *
 * Step plan:
 *   1..N — one step per active goal, rating with the 5 goal-specific
 *          GAS anchors. Middle option is visually highlighted but not
 *          labelled as "expected" — the goal-specific text carries the
 *          meaning.
 *   N+1  — optional comment field with safety nudge + summary review.
 */
export default function CheckinPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-cream" />}>
      <CheckinPageInner />
    </Suspense>
  );
}

function CheckinPageInner() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('patient.checkin');
  const searchParams = useSearchParams();
  const promptIdParam = searchParams.get('promptId');

  const { user, profile, loading: authLoading } = useAuth();
  const checkinQuery = useCheckinData(profile?.id ?? null, profile?.role, promptIdParam);
  const submitMutation = useSubmitCheckin();

  const homePath = locale === 'en' ? '/' : `/${locale}`;
  const goHome = () => router.push(homePath);
  // Hard navigation for the terminal thanks screen — see comment below.
  const goHomeHard = () => {
    if (typeof window !== 'undefined') {
      window.location.href = homePath;
    } else {
      router.push(homePath);
    }
  };

  // Auth gating: not signed in → /login; not a patient → /.
  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) {
      router.replace(locale === 'en' ? '/login' : `/${locale}/login`);
      return;
    }
    if (profile.role !== 'patient') {
      router.replace(homePath);
    }
  }, [authLoading, user, profile, router, locale, homePath]);

  // Submission lifecycle: once we kick off submit, we want to render the
  // thanks view, NOT redirect home (which the next effect would do once
  // the prompt clears from the cache). The ref lets us short-circuit
  // the redirect synchronously.
  const submittingRef = useRef(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  // Redirect home if there's nothing to check in on. Skip during submit
  // (the thanks view takes over) and skip while data is still loading.
  useEffect(() => {
    if (submittingRef.current || submittedId) return;
    if (checkinQuery.isLoading || !checkinQuery.data) return;
    if (checkinQuery.data.goals.length === 0) {
      router.replace(homePath);
    }
  }, [
    checkinQuery.isLoading,
    checkinQuery.data,
    router,
    homePath,
    submittedId
  ]);

  // The draft hook expects { id, activeTreatmentCycleId } for the patient
  // and { id, weekNumber } for the prompt. Use placeholders while loading
  // so hooks are called unconditionally; the page returns null below if
  // data is missing.
  const safePatient =
    profile && checkinQuery.data
      ? { id: profile.id, activeTreatmentCycleId: 'cycle' }
      : { id: 'placeholder', activeTreatmentCycleId: 'placeholder' };
  const safePrompt = checkinQuery.data?.prompt ?? {
    id: 'placeholder',
    weekNumber: 0
  };

  const { draft, update, setRating, goToStep, reset } = useCheckinDraft({
    patient: safePatient,
    prompt: safePrompt
  });

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Thanks view comes first — see ref comment above.
  if (submittedId) {
    return <ThanksView onBackHome={goHomeHard} />;
  }

  // Auth or data still loading → render nothing (could add a spinner).
  if (
    authLoading ||
    !profile ||
    profile.role !== 'patient' ||
    checkinQuery.isLoading
  ) {
    return null;
  }

  // Query errored or there's no pending prompt → redirect home (the
  // effect above triggers the redirect; render nothing until it does).
  if (!checkinQuery.data) {
    return null;
  }

  const { prompt, goals: activeGoals } = checkinQuery.data;

  if (activeGoals.length === 0) {
    return null;
  }

  // Step bookkeeping --------------------------------------------------
  const totalSteps = activeGoals.length + 1;
  const step = Math.min(Math.max(draft.currentStep, 1), totalSteps);
  const isLastStep = step === totalSteps;

  const currentStepComplete = (() => {
    if (isLastStep) {
      return isCheckinComplete(draft, activeGoals.map((g) => g.id));
    }
    const goal = activeGoals[step - 1];
    return typeof draft.ratings[goal.id] === 'number';
  })();

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

  const doSubmit = async () => {
    if (!isCheckinComplete(draft, activeGoals.map((g) => g.id))) return;
    if (submitMutation.isPending) return;

    submittingRef.current = true;

    try {
      const ratings = activeGoals.map((g) => {
        const v = draft.ratings[g.id];
        if (typeof v !== 'number') {
          throw new Error('Missing rating for goal ' + g.id);
        }
        const value = v as -2 | -1 | 0 | 1 | 2;
        return {
          approvedGoalId: g.id,
          ratingLabel: ratingLabelForValue(value),
          ratingValue: value
        };
      });

      const id = await submitMutation.mutateAsync({
        promptId: prompt.id,
        ratings,
        comment: draft.comment?.trim() || undefined
      });

      checkinDraftStorage.clear(prompt.id);
      reset();
      setSubmittedId(id);
    } catch (err) {
      console.error('submitCheckin failed', err);
      submittingRef.current = false;
      // Could show an inline error toast here — left for a polish slice.
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
          label: isLastStep
            ? submitMutation.isPending
              ? t('submitting') /* falls back to 'Submit…' if missing key */
              : t('submit')
            : t('next'),
          onClick: goNext,
          disabled: !currentStepComplete || submitMutation.isPending
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
            {t('cancelConfirmLeave')}
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
      <main className="mx-auto max-w-[480px] px-5 py-16">
        <h1 className="font-display text-[28px] leading-tight text-ink">
          {t('thanksTitle')}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          {t('thanksBody')}
        </p>
        <button
          type="button"
          onClick={onBackHome}
          className="mt-8 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-cream-soft hover:bg-ink-soft"
        >
          {t('backToHome')}
        </button>
      </main>
    </div>
  );
}
