'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useCheckinData, useSubmitCheckin, uploadGoalVideo } from '@/lib/supabase/checkin';
import { useCheckinDraft, checkinDraftStorage } from '@/lib/useCheckinDraft';
import { useModalA11y } from '@/lib/useModalA11y';
import { isCheckinComplete } from '@/lib/checkinDraft';
import { classifyError } from '@/lib/feedback';
import { useToast } from '@/components/feedback/Toast';
import {
  SkeletonBlock,
  SkeletonScreen
} from '@/components/feedback/Skeleton';
import { WizardLayout } from '@/components/wizard/WizardLayout';
import { GoalRatingPicker } from '@/components/wizard/GoalRatingPicker';
import { GasGoalRatingPicker } from '@/components/wizard/GasGoalRatingPicker';
import {
  GoalVideoRecorder,
  type RecordedVideo
} from '@/components/wizard/GoalVideoRecorder';
import { TrainingDaysPicker } from '@/components/wizard/TrainingDaysPicker';

/**
 * Weekly check-in wizard. Lives at /checkin (or /<locale>/checkin).
 *
 * Optional ?promptId=X query param targets a specific pending prompt
 * (used when the patient taps a catch-up week from the home page).
 * Without the param, the oldest pending prompt is used.
 *
 * Steps (built dynamically from the patient's active goals):
 *   - One rating step per active goal: NRS goals use the 0–10 picker,
 *     GAS goals use the five descriptive levels. A video-enabled goal
 *     also offers an optional short video on its step.
 *   - Training days — at home, and with the therapist where relevant.
 *   - A final comment field with a safety nudge + summary review.
 */
export default function CheckinPage() {
  return (
    <Suspense fallback={<CheckinSkeleton />}>
      <CheckinPageInner />
    </Suspense>
  );
}

/** Plain-language meaning of a GAS level, for the summary review. */
function gasLevelMeaning(
  v: number,
  t: (key: string) => string
): string {
  switch (v) {
    case 2:
      return t('gasMeaningMuchBetter');
    case 1:
      return t('gasMeaningBetter');
    case 0:
      return t('gasMeaningAsExpected');
    case -1:
      return t('gasMeaningLess');
    case -2:
      return t('gasMeaningMuchLess');
    default:
      return '—';
  }
}

function CheckinPageInner() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('patient.checkin');
  const tA11y = useTranslations('a11y');
  const tTraining = useTranslations('training');
  const searchParams = useSearchParams();
  const promptIdParam = searchParams.get('promptId');

  const { user, profile, loading: authLoading } = useAuth();
  const checkinQuery = useCheckinData(profile?.id ?? null, profile?.role, promptIdParam);
  const submitMutation = useSubmitCheckin();
  const toast = useToast();
  const tFeedback = useTranslations('feedback');

  const homePath = locale === 'en' ? '/' : `/${locale}`;
  // Leaving the check-in navigates home. A soft router.push proved unreliable
  // from this page (the push was sometimes swallowed), so we do a hard
  // navigation — the draft is already persisted, so a full reload is safe.
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
  // Recorded videos, keyed by goal id. Kept in ephemeral state (not the
  // persisted draft) because Blobs can't be serialised to storage and
  // are only relevant in this session, right before submit.
  const [videos, setVideos] = useState<Record<string, RecordedVideo>>({});
  // Whether the "leave this check-in?" confirmation dialog is open. Must
  // live here, above every early return below, so the hook order is stable
  // across the loading → loaded transition (React rules of hooks).
  const [confirmLeave, setConfirmLeave] = useState(false);

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

  // Thanks view comes first — see ref comment above.
  if (submittedId) {
    return <ThanksView onBackHome={goHomeHard} />;
  }

  // Auth or data still loading → render a wizard-shaped skeleton so
  // the page feels structured rather than blank.
  if (
    authLoading ||
    !profile ||
    profile.role !== 'patient' ||
    checkinQuery.isLoading
  ) {
    return <CheckinSkeleton />;
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
  // Steps: 1..N goal ratings, then training-days, then comment/submit.
  const totalSteps = activeGoals.length + 2;
  const step = Math.min(Math.max(draft.currentStep, 1), totalSteps);
  const trainingStep = activeGoals.length + 1;
  const isTrainingStep = step === trainingStep;
  const isLastStep = step === totalSteps;

  const currentStepComplete = (() => {
    if (isLastStep) {
      return isCheckinComplete(draft, activeGoals.map((g) => g.id));
    }
    // Training days are optional — an empty selection means "didn't
    // train this week", so the patient can always continue.
    if (isTrainingStep) {
      return true;
    }
    const goal = activeGoals[step - 1];
    return typeof draft.ratings[goal.id] === 'number';
  })();

  // Cancelling opens a confirmation dialog (Leave for now / Keep going).
  // The draft is persisted on every change, so leaving never loses input —
  // the patient resumes exactly where they left off next time.
  const onCancel = () => {
    setConfirmLeave(true);
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
      // Upload any recorded videos first and collect their Storage paths.
      // A video is optional, so a failed upload must NOT block the
      // check-in — we drop that video and flag it afterwards.
      const patientId = checkinQuery.data?.patientId ?? null;
      const videoPaths: Record<string, string> = {};
      let videoFailed = false;
      for (const g of activeGoals) {
        const rec = videos[g.id];
        if (!rec || !patientId) continue;
        try {
          videoPaths[g.id] = await uploadGoalVideo({
            patientId,
            promptId: prompt.id,
            goalId: g.id,
            blob: rec.blob,
            ext: rec.ext
          });
        } catch (e) {
          console.error('goal video upload failed', g.id, e);
          videoFailed = true;
        }
      }

      const ratings = activeGoals.map((g) => {
        const v = draft.ratings[g.id];
        if (typeof v !== 'number') {
          throw new Error('Missing rating for goal ' + g.id);
        }
        // The draft stores one number per goal; its meaning depends on
        // the goal kind. NRS goals send it as nrsValue (0–10); GAS goals
        // send it as gasValue (−2..2, the level the patient picked).
        const base =
          g.kind === 'gas'
            ? { approvedGoalId: g.id, gasValue: v }
            : { approvedGoalId: g.id, nrsValue: v };
        return videoPaths[g.id]
          ? { ...base, videoPath: videoPaths[g.id] }
          : base;
      });

      const id = await submitMutation.mutateAsync({
        promptId: prompt.id,
        ratings,
        comment: draft.comment?.trim() || undefined,
        submitterLabel: draft.submitterLabel ?? 'self',
        trainingDays: draft.trainingDays ?? [],
        trainingDaysTherapist: draft.trainingDaysTherapist ?? []
      });

      checkinDraftStorage.clear(prompt.id);
      reset();
      setSubmittedId(id);
      toast.success(tFeedback('successCheckin'));
      if (videoFailed) {
        toast.error(tFeedback('videoUploadPartial'));
      }
    } catch (err) {
      console.error('submitCheckin failed', err);
      submittingRef.current = false;
      toast.error(tFeedback(classifyError(err)));
    }
  };

  // Step body ---------------------------------------------------------
  let title = '';
  let helper = '';
  let body = null;

  // A persistent, plain indicator of WHICH week the patient is filling.
  // The default check-in opens the current week, but a patient can also
  // reach an earlier (catch-up) week from the home page — without this
  // they could fill a past week without realising. Shown on every step.
  const weekBanner = (
    <div className="mb-4 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2 text-[13px] font-semibold text-ink-soft">
      {t('weekBanner', { week: prompt.weekNumber })}
    </div>
  );

  if (isTrainingStep) {
    title = tTraining('title');
    helper = tTraining('helper');
    body = (
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[14px] font-semibold text-ink">
            {tTraining('atHome')}
          </p>
          <TrainingDaysPicker
            ariaLabel={tTraining('atHome')}
            value={draft.trainingDays ?? []}
            onChange={(days) => update({ trainingDays: days })}
          />
        </div>
        <div>
          <p className="mb-2 text-[14px] font-semibold text-ink">
            {tTraining('withTherapist')}
          </p>
          <TrainingDaysPicker
            ariaLabel={tTraining('withTherapist')}
            value={draft.trainingDaysTherapist ?? []}
            onChange={(days) => update({ trainingDaysTherapist: days })}
          />
        </div>
      </div>
    );
  } else if (!isLastStep) {
    const goal = activeGoals[step - 1];
    title = t('rateGoalTitle');
    helper = goal.kind === 'gas' ? t('rateGoalHelperGas') : t('rateGoalHelper');
    // Optional video is offered when the clinician enabled it for this
    // goal AND we're in the peak-effect window (weeks 6–8) AND no video
    // has been recorded for this goal yet this cycle — so the patient can
    // choose any one of those weeks, but only one video per cycle.
    const showVideo =
      goal.videoEnabled &&
      [6, 7, 8].includes(prompt.weekNumber) &&
      !goal.videoAlreadyInCycle;
    const picker =
      goal.kind === 'gas' ? (
        <GasGoalRatingPicker
          ariaLabel={`${goal.patientFacingText} — ${title}`}
          goalText={goal.patientFacingText}
          anchors={goal.gas ?? null}
          value={draft.ratings[goal.id]}
          onChange={(v) => setRating(goal.id, v)}
        />
      ) : (
        <GoalRatingPicker
          ariaLabel={`${goal.patientFacingText} — ${title}`}
          goalText={goal.patientFacingText}
          question={goal.nrs?.question ?? ''}
          direction={goal.nrs?.direction ?? 'higherIsBetter'}
          value={draft.ratings[goal.id]}
          onChange={(v) => setRating(goal.id, v)}
          previousRating={goal.previousRating}
        />
      );
    body = (
      <>
        {picker}
        {showVideo && (
          <GoalVideoRecorder
            value={videos[goal.id] ?? null}
            onChange={(v) =>
              setVideos((prev) => {
                if (!v) {
                  const next = { ...prev };
                  delete next[goal.id];
                  return next;
                }
                return { ...prev, [goal.id]: v };
              })
            }
          />
        )}
      </>
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
        <p className="mt-2 text-[14px] text-ink-muted">
          {t('commentSafetyNote')}
        </p>

        {/* Submitter attribution — ask who filled this in, default to
            'self' if the patient just continues without choosing. Two
            big buttons so it's reachable with reduced motor control. */}
        <section className="mt-8">
          <p className="font-display text-[16px] text-ink">
            {t('submitterTitle')}
          </p>
          <p className="mt-1 text-[14px] text-ink-soft">
            {t('submitterHelper')}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => update({ submitterLabel: 'self' })}
              aria-pressed={draft.submitterLabel !== 'caregiver'}
              className={`flex h-14 flex-1 items-center justify-center rounded-[var(--radius-button)] border-2 text-[15px] font-semibold ${
                draft.submitterLabel !== 'caregiver'
                  ? 'border-sage bg-sage-soft text-sage-deep'
                  : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
              }`}
            >
              {t('submitterSelf')}
            </button>
            <button
              type="button"
              onClick={() => update({ submitterLabel: 'caregiver' })}
              aria-pressed={draft.submitterLabel === 'caregiver'}
              className={`flex h-14 flex-1 items-center justify-center rounded-[var(--radius-button)] border-2 text-[15px] font-semibold ${
                draft.submitterLabel === 'caregiver'
                  ? 'border-sage bg-sage-soft text-sage-deep'
                  : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
              }`}
            >
              {t('submitterCaregiver')}
            </button>
          </div>
        </section>

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
                answer =
                  g.kind === 'gas'
                    ? gasLevelMeaning(rating, t)
                    : `${rating} / 10`;
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
        forgiving={false}
        helpPageKey="checkin"
        stepLabels={[
          ...activeGoals.map((g) => ({
            label: g.patientFacingText,
            done: typeof draft.ratings[g.id] === 'number'
          })),
          {
            label: tTraining('stepLabel'),
            done: step > trainingStep
          },
          {
            label: t('summaryStepLabel'),
            // The summary step is "done" only once submitted; while the
            // patient is on it, it just shows as current.
            done: false
          }
        ]}
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
        {weekBanner}
        {body}
      </WizardLayout>
      {confirmLeave && (
        <CancelCheckinDialog
          onLeave={goHomeHard}
          onKeep={() => setConfirmLeave(false)}
        />
      )}
    </>
  );
}

/**
 * Confirm dialog shown when the patient taps Cancel mid-check-in. Their
 * draft is kept either way (it auto-persists), so "Leave for now" just
 * navigates home and the check-in can be resumed this week.
 */
function CancelCheckinDialog({
  onLeave,
  onKeep
}: {
  onLeave: () => void;
  onKeep: () => void;
}) {
  const t = useTranslations('patient.checkin');
  const containerRef = useModalA11y(onKeep);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkin-cancel-title"
        className="w-full max-w-[400px] rounded-[var(--radius-card)] border border-stone bg-cream p-6 shadow-xl"
      >
        <h2
          id="checkin-cancel-title"
          className="font-display text-[20px] leading-tight text-ink"
        >
          {t('cancelConfirmTitle')}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          {t('cancelConfirmBody')}
        </p>
        <div className="mt-6 flex flex-col gap-2">
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
        <dt className="text-[14px] font-semibold text-ink-soft">{label}</dt>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-[14px] font-semibold text-sage-deep hover:underline"
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
          className="mt-8 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft"
        >
          {t('thanksBackHome')}
        </button>
      </main>
    </div>
  );
}

/**
 * Loading skeleton for the check-in wizard. Matches the WizardLayout
 * shape so the page feels structured before the goals and prompt
 * actually load. Real wizard has: header bar with back + step counter,
 * heading + helper text, body content, primary + secondary action row.
 */
function CheckinSkeleton() {
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
          {/* Step heading */}
          <SkeletonBlock width="w-3/5" height="h-7" />
          <SkeletonBlock width="w-4/5" height="h-4" className="mt-2" />

          {/* Body content area (mimics the slider step) */}
          <div className="mt-10">
            <SkeletonBlock width="w-4/5" height="h-5" />
            <SkeletonBlock width="w-3/5" height="h-4" className="mt-2" />

            <div className="mt-8 flex flex-col items-center">
              <SkeletonBlock width="w-24" height="h-16" />
              <SkeletonBlock
                width="w-full max-w-[320px]"
                height="h-2"
                shape="rounded-full"
                className="mt-6"
              />
              <div className="mt-3 flex w-full max-w-[320px] justify-between">
                <SkeletonBlock width="w-16" height="h-3" />
                <SkeletonBlock width="w-16" height="h-3" />
              </div>
            </div>
          </div>
        </SkeletonScreen>

        {/* Sticky action row at bottom */}
        <div className="fixed inset-x-0 bottom-0 border-t border-stone/70 bg-cream-soft/95 px-5 py-4">
          <div className="mx-auto max-w-[480px]">
            <SkeletonBlock
              width="w-full"
              height="h-12"
              shape="rounded-[var(--radius-button)]"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
