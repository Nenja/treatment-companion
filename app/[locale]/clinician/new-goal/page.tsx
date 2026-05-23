'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useCreateGoalForPatient } from '@/lib/supabase/clinicianPatient';
import { GasCutPoints } from '@/components/clinician/GasCutPoints';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { useToast } from '@/components/feedback/Toast';
import { classifyError } from '@/lib/feedback';
import type { NrsDirection } from '@/lib/types';

const inputClasses =
  'mt-2 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none';

/**
 * Record a goal the patient voiced in clinic.
 *
 * The app's model is patient-first — a patient suggests a goal, the
 * physician approves it. This page covers the in-clinic case: the
 * patient stated a goal out loud, and rather than asking them to go
 * home and type it into the app, the physician records it directly.
 *
 * The goal still ORIGINATES from the patient; the physician is only
 * the scribe. Mechanically this is the goal-approval form without the
 * suggestion-context panel — same NRS setup, same GAS cut points — and
 * it calls create_goal_for_patient, which inserts an approved_goal
 * with no linked goal_suggestion.
 */
export default function NewGoalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const { profile, loading: authLoading } = useAuth();
  const create = useCreateGoalForPatient();
  const toast = useToast();

  const patientId = searchParams.get('patient') ?? '';
  const prefix = locale === 'en' ? '' : `/${locale}`;
  const patientPath = `${prefix}/clinician/patient`;

  const [patientText, setPatientText] = useState('');
  const [smartText, setSmartText] = useState('');
  const [nrsQuestion, setNrsQuestion] = useState('');
  const [nrsDirection, setNrsDirection] =
    useState<NrsDirection>('higherIsBetter');
  const [cutLowLow, setCutLowLow] = useState('');
  const [cutLow, setCutLow] = useState('');
  const [cutZero, setCutZero] = useState('');
  const [cutHigh, setCutHigh] = useState('');

  const cutLowLowN = Number(cutLowLow);
  const cutLowN = Number(cutLow);
  const cutZeroN = Number(cutZero);
  const cutHighN = Number(cutHigh);
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

  const canSubmit =
    patientText.trim().length > 0 &&
    smartText.trim().length > 0 &&
    nrsQuestion.trim().length > 0 &&
    cutsValid &&
    !create.isPending;

  // Only a signed-in physician may use this page.
  if (!authLoading && profile && profile.role !== 'clinician') {
    router.replace(prefix || '/');
  }

  const onSubmit = async () => {
    if (!canSubmit || !patientId) return;
    try {
      await create.mutateAsync({
        patientId,
        patientFacingText: patientText.trim(),
        smartText: smartText.trim(),
        nrsQuestion: nrsQuestion.trim(),
        nrsDirection,
        cutLowLow: cutLowLowN,
        cutLow: cutLowN,
        cutZero: cutZeroN,
        cutHigh: cutHighN
      });
      toast.success('Goal recorded');
      router.push(patientPath);
    } catch (err) {
      toast.error(
        classifyError(err) === 'errorGeneric'
          ? 'Could not record the goal. Please try again.'
          : 'Could not record the goal.'
      );
    }
  };

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
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className="mx-auto flex max-w-[480px] items-center justify-between px-5 py-4">
          <button
            type="button"
            onClick={() => router.push(patientPath)}
            className="text-[14px] font-semibold text-ink-soft hover:text-ink"
          >
            Cancel
          </button>
          <span className="eyebrow">Record a goal</span>
          <AccountMenu />
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-5 py-8">
        <h1 className="font-display text-[24px] leading-tight text-ink">
          Record a goal for this patient
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          Use this for a goal the patient told you about in clinic.
          Write it in the patient&apos;s own words — it becomes one of
          their active goals straight away.
        </p>

        <div className="mt-2">
          <label className="block text-[14px] font-semibold text-ink">
            Goal in the patient&apos;s words
          </label>
          <p className="mt-1 text-[14px] text-ink-muted">
            Plain language, as the patient would say it.
          </p>
          <textarea
            value={patientText}
            onChange={(e) => setPatientText(e.target.value)}
            rows={2}
            maxLength={300}
            className={inputClasses}
            placeholder="e.g. I want to be able to hold a cup of tea steady."
          />
        </div>

        <div className="mt-7">
          <label className="block text-[14px] font-semibold text-ink">
            Clinical (SMART) description
          </label>
          <p className="mt-1 text-[14px] text-ink-muted">
            Your clinical phrasing of the same goal.
          </p>
          <textarea
            value={smartText}
            onChange={(e) => setSmartText(e.target.value)}
            rows={3}
            maxLength={400}
            className={inputClasses}
          />
        </div>

        <h2 className="mt-8 font-display text-[17px] text-ink">
          NRS rating setup
        </h2>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
          The patient rates this goal 0–10 each week. You set the
          question they see and how their answer maps to a GAS level.
        </p>

        <div className="mt-5">
          <label className="block text-[14px] font-semibold text-ink">
            NRS question (patient-facing)
          </label>
          <textarea
            value={nrsQuestion}
            onChange={(e) => setNrsQuestion(e.target.value)}
            rows={3}
            maxLength={300}
            className={inputClasses}
            placeholder="e.g. On a scale of 0-10, how steady is your hand when holding a cup?"
          />
        </div>

        <div className="mt-7">
          <label className="block text-[14px] font-semibold text-ink">
            Direction
          </label>
          <p className="mt-1 text-[14px] text-ink-muted">
            What &lsquo;higher&rsquo; means on the 0–10 scale for this
            goal.
          </p>
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
        </div>

        <div className="mt-7">
          <label className="block text-[14px] font-semibold text-ink">
            GAS outcome levels
          </label>
          <p className="mt-1 text-[14px] text-ink-muted">
            Set the highest NRS answer that counts as each outcome.
          </p>
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
              Each NRS cut-off must be a whole number from 0 to 9, and
              each one higher than the one above it.
            </p>
          )}
        </div>

        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={() => router.push(patientPath)}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="flex h-12 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-cream-soft hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-muted"
          >
            {create.isPending ? 'Recording…' : 'Record goal'}
          </button>
        </div>
      </main>
    </div>
  );
}
