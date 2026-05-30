'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  useCreateGoalForPatient,
  useCreateGasGoalForPatient
} from '@/lib/supabase/clinicianPatient';
import { GasCutPoints } from '@/components/clinician/GasCutPoints';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { EndSessionButton } from '@/components/clinician/EndSessionButton';
import { PageHelpButton } from '@/components/feedback/PageHelpButton';
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
 *
 * The default export wraps the worker in <Suspense> because the worker
 * calls useSearchParams() (it reads ?patient=...); Next.js requires a
 * Suspense boundary around that for the build to prerender the route.
 */
export default function NewGoalPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-cream" />}>
      <NewGoalInner />
    </Suspense>
  );
}

function NewGoalInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const { profile, loading: authLoading } = useAuth();
  const create = useCreateGoalForPatient();
  const createGas = useCreateGasGoalForPatient();
  const toast = useToast();

  const patientId = searchParams.get('patient') ?? '';
  const prefix = locale === 'en' ? '' : `/${locale}`;
  const patientPath = `${prefix}/clinician/patient`;

  // Which measurement model this goal uses. NRS (0–10 question + cut
  // points) or GAS (five descriptive anchors the patient picks from).
  const [goalKind, setGoalKind] = useState<'nrs' | 'gas'>('nrs');

  const [patientText, setPatientText] = useState('');
  const [smartText, setSmartText] = useState('');
  const [nrsQuestion, setNrsQuestion] = useState('');
  const [nrsDirection, setNrsDirection] =
    useState<NrsDirection>('higherIsBetter');
  const [cutLowLow, setCutLowLow] = useState('');
  const [cutLow, setCutLow] = useState('');
  const [cutZero, setCutZero] = useState('');
  const [cutHigh, setCutHigh] = useState('');

  // GAS anchors — one sentence per outcome level. Required only when
  // goalKind === 'gas'.
  const [anchorMinus2, setAnchorMinus2] = useState('');
  const [anchorMinus1, setAnchorMinus1] = useState('');
  const [anchorZero, setAnchorZero] = useState('');
  const [anchorPlus1, setAnchorPlus1] = useState('');
  const [anchorPlus2, setAnchorPlus2] = useState('');

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

  // GAS anchors are optional — a GAS goal needs only the goal text and
  // clinical description. Any anchors the clinician does write are kept;
  // blank ones simply show the patient the generic level meaning.
  const commonValid =
    patientText.trim().length > 0 && smartText.trim().length > 0;

  const canSubmit =
    commonValid &&
    (goalKind === 'nrs'
      ? nrsQuestion.trim().length > 0 && cutsValid
      : true) &&
    !create.isPending &&
    !createGas.isPending;

  // Only a signed-in physician may use this page.
  if (!authLoading && profile && profile.role !== 'clinician') {
    router.replace(prefix || '/');
  }

  const onSubmit = async () => {
    if (!canSubmit || !patientId) return;
    try {
      if (goalKind === 'nrs') {
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
      } else {
        await createGas.mutateAsync({
          patientId,
          patientFacingText: patientText.trim(),
          smartText: smartText.trim(),
          anchorMinus2: anchorMinus2.trim(),
          anchorMinus1: anchorMinus1.trim(),
          anchorZero: anchorZero.trim(),
          anchorPlus1: anchorPlus1.trim(),
          anchorPlus2: anchorPlus2.trim()
        });
      }
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
        <div className="mx-auto flex max-w-[var(--max-w-page-mid)] items-center justify-between px-5 py-4">
          <button
            type="button"
            onClick={() => router.push(patientPath)}
            className="text-[14px] font-semibold text-ink-soft hover:text-ink"
          >
            Cancel
          </button>
          <span className="eyebrow min-w-0 truncate px-2 text-center">Record a goal</span>
          <div className="flex shrink-0 items-center gap-1.5">
            <EndSessionButton role="clinician" />
            <PageHelpButton pageKey="newGoal" />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[var(--max-w-page-mid)] px-5 py-8">
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

        <div className="mt-8">
          <label className="block text-[14px] font-semibold text-ink">
            How will the patient rate this goal?
          </label>
          <p className="mt-1 text-[14px] text-ink-muted">
            Choose the measurement model for this goal.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setGoalKind('nrs')}
              className={`flex-1 rounded-[var(--radius-button)] border px-3 py-3 text-left ${
                goalKind === 'nrs'
                  ? 'border-sage bg-sage-soft'
                  : 'border-stone bg-cream-soft hover:bg-stone-soft'
              }`}
            >
              <span
                className={`block text-[14px] font-semibold ${
                  goalKind === 'nrs' ? 'text-sage-deep' : 'text-ink'
                }`}
              >
                0–10 scale (NRS)
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-ink-muted">
                Patient answers a 0–10 question each week; you set how
                the answer maps to outcome levels.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setGoalKind('gas')}
              className={`flex-1 rounded-[var(--radius-button)] border px-3 py-3 text-left ${
                goalKind === 'gas'
                  ? 'border-sage bg-sage-soft'
                  : 'border-stone bg-cream-soft hover:bg-stone-soft'
              }`}
            >
              <span
                className={`block text-[14px] font-semibold ${
                  goalKind === 'gas' ? 'text-sage-deep' : 'text-ink'
                }`}
              >
                Descriptive levels (GAS)
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-ink-muted">
                You describe each outcome level in words; the patient
                picks the one that matches.
              </span>
            </button>
          </div>
        </div>

        {goalKind === 'nrs' && (
          <>
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
          </>
        )}

        {goalKind === 'gas' && (
          <>
            <h2 className="mt-8 font-display text-[17px] text-ink">
              GAS outcome levels
            </h2>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
              Optionally describe what each level looks like for this
              goal, in one sentence each. The patient reads these and
              picks the level that matches — there is no 0–10 scale.
              Leave any blank to let the patient rate against the goal
              text using the level&apos;s general meaning. Describe
              observable outcomes, with 0 as the expected result of
              treatment.
            </p>

            <div className="mt-5 space-y-4">
              <GasAnchorField
                level="+2"
                label="Much more than expected"
                tone="better"
                value={anchorPlus2}
                onChange={setAnchorPlus2}
                placeholder="e.g. Holds a full cup and drinks unaided, no spills."
              />
              <GasAnchorField
                level="+1"
                label="More than expected"
                tone="better"
                value={anchorPlus1}
                onChange={setAnchorPlus1}
                placeholder="e.g. Holds a half-full cup steadily for a few seconds."
              />
              <GasAnchorField
                level="0"
                label="Expected outcome"
                tone="expected"
                value={anchorZero}
                onChange={setAnchorZero}
                placeholder="e.g. Holds a light cup briefly with some effort."
              />
              <GasAnchorField
                level="−1"
                label="Less than expected"
                tone="below"
                value={anchorMinus1}
                onChange={setAnchorMinus1}
                placeholder="e.g. Can grip the cup but not lift it without spilling."
              />
              <GasAnchorField
                level="−2"
                label="Much less than expected"
                tone="below"
                value={anchorMinus2}
                onChange={setAnchorMinus2}
                placeholder="e.g. Cannot grip the cup at all."
              />
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
              Tip: write the levels so they step up steadily, with no
              gaps or overlaps between them.
            </p>
          </>
        )}

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
            className="flex h-12 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-muted"
          >
            {create.isPending ? 'Recording…' : 'Record goal'}
          </button>
        </div>
      </main>
    </div>
  );
}

/**
 * One GAS anchor input: a colour-coded level badge (+2…−2), a short
 * label, and the sentence field. Tone maps to the app's GAS palette so
 * the levels read the same way they do on the progress graph (sage =
 * better than expected, cream = expected, amber = below).
 */
function GasAnchorField({
  level,
  label,
  tone,
  value,
  onChange,
  placeholder
}: {
  level: string;
  label: string;
  tone: 'better' | 'expected' | 'below';
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const badgeClass =
    tone === 'better'
      ? 'bg-sage-soft text-sage-deep'
      : tone === 'below'
        ? 'bg-amber-soft text-amber-deep'
        : 'bg-stone text-ink-soft';
  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-6 min-w-[2rem] items-center justify-center rounded-[var(--radius-button)] px-1.5 text-[13px] font-semibold tabular-nums ${badgeClass}`}
        >
          {level}
        </span>
        <span className="text-[14px] font-semibold text-ink">{label}</span>
        <span className="text-[12px] text-ink-muted">(optional)</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        maxLength={300}
        className={inputClasses}
        placeholder={placeholder}
      />
    </div>
  );
}
