'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useToast } from '@/components/feedback/Toast';
import { classifyError } from '@/lib/feedback';
import { formatLongDate } from '@/lib/dates';
import { physioSuggestionStatusLabel } from '@/lib/physioSuggestionStatus';
import { INJECTION_SIDES, type InjectionSide } from '@/lib/types';
import {
  useSubmitPhysioMuscleSuggestion,
  usePhysioMuscleSuggestions
} from '@/lib/supabase/physioMuscleSuggestion';
import type { PhysioPatientData } from '@/lib/supabase/physioPatient';

interface PhysioMuscleSuggestionFormProps {
  patientId: string;
  goals: PhysioPatientData['goals'];
}

const SIDE_LABEL: Record<InjectionSide, string> = {
  left: 'Left',
  right: 'Right',
  bilateral: 'Bilateral'
};

/**
 * Physiotherapist muscle-suggestion surface.
 *
 * The physiotherapist flags a muscle that may be involved, for the
 * physician to consider when planning the next injection: muscle name
 * (free text, same as the physician's own injection entry), side, a
 * clinical rationale, and an optional link to the goal it relates to.
 * Below the form, muscle suggestions already made this cycle are listed.
 */
export function PhysioMuscleSuggestionForm({
  patientId,
  goals
}: PhysioMuscleSuggestionFormProps) {
  const toast = useToast();
  const locale = useLocale();
  const submit = useSubmitPhysioMuscleSuggestion();
  const existing = usePhysioMuscleSuggestions(patientId, true);

  const [muscle, setMuscle] = useState('');
  const [side, setSide] = useState<InjectionSide>('left');
  const [rationale, setRationale] = useState('');
  const [relatedGoalId, setRelatedGoalId] = useState<string>('');

  const canSubmit =
    muscle.trim().length > 0 &&
    rationale.trim().length > 0 &&
    !submit.isPending;

  // Look up a goal's text for display in the "suggestions made" list.
  const goalText = (id: string | null): string | null => {
    if (!id) return null;
    return goals.find((g) => g.id === id)?.patientFacingText ?? null;
  };

  const doSubmit = async () => {
    if (!canSubmit) return;
    try {
      await submit.mutateAsync({
        patientId,
        muscle: muscle.trim(),
        side,
        rationale: rationale.trim(),
        relatedGoalId: relatedGoalId || null
      });
      toast.success('Muscle suggestion sent');
      setMuscle('');
      setSide('left');
      setRationale('');
      setRelatedGoalId('');
    } catch (err) {
      toast.error(
        classifyError(err) === 'errorGeneric'
          ? 'Could not send the suggestion. Please try again.'
          : 'Could not send the suggestion.'
      );
    }
  };

  return (
    <div>
      <section className="mt-6">
        <h2 className="font-display text-[20px] text-ink">
          Suggest a muscle
        </h2>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
          Flag a muscle that may be involved, for the physician to
          consider at the next injection visit.
        </p>

        {/* Muscle name */}
        <div className="mt-5">
          <label
            htmlFor="physio-muscle"
            className="block text-[14px] font-semibold text-ink"
          >
            Muscle
          </label>
          <input
            id="physio-muscle"
            type="text"
            value={muscle}
            onChange={(e) => setMuscle(e.target.value)}
            maxLength={80}
            className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
            placeholder="e.g. Gastrocnemius"
          />
        </div>

        {/* Side — three-way segmented control */}
        <div className="mt-5">
          <span className="block text-[14px] font-semibold text-ink">
            Side
          </span>
          <div
            role="radiogroup"
            aria-label="Side"
            className="mt-1.5 flex gap-2"
          >
            {INJECTION_SIDES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={side === s}
                onClick={() => setSide(s)}
                className={`flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] border text-[14px] font-semibold ${
                  side === s
                    ? 'border-sage bg-sage-soft text-sage-deep'
                    : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
                }`}
              >
                {SIDE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Optional goal link */}
        {goals.length > 0 && (
          <div className="mt-5">
            <label
              htmlFor="physio-muscle-goal"
              className="block text-[14px] font-semibold text-ink"
            >
              Related goal{' '}
              <span className="text-ink-muted">(optional)</span>
            </label>
            <p className="mt-0.5 text-[14px] text-ink-muted">
              Link this muscle to a goal if the observation came up in
              that goal&apos;s context.
            </p>
            <select
              id="physio-muscle-goal"
              value={relatedGoalId}
              onChange={(e) => setRelatedGoalId(e.target.value)}
              className="mt-2 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[15px] text-ink focus:border-sage focus:outline-none"
            >
              <option value="">No specific goal</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.patientFacingText}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Rationale */}
        <div className="mt-5">
          <label
            htmlFor="physio-muscle-rationale"
            className="block text-[14px] font-semibold text-ink"
          >
            Clinical rationale
          </label>
          <p className="mt-0.5 text-[14px] text-ink-muted">
            What you observed that led to flagging this muscle.
          </p>
          <textarea
            id="physio-muscle-rationale"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={4}
            maxLength={1000}
            className="mt-2 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
            placeholder="e.g. Marked tone in the left gastrocnemius limiting dorsiflexion during swing phase of gait."
          />
        </div>

        <button
          type="button"
          onClick={doSubmit}
          disabled={!canSubmit}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submit.isPending ? 'Sending…' : 'Send muscle suggestion'}
        </button>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-[20px] text-ink">
          Muscle suggestions made
        </h2>
        {existing.isLoading ? (
          <p className="mt-3 text-[14px] text-ink-muted">Loading…</p>
        ) : !existing.data || existing.data.length === 0 ? (
          <p className="mt-3 text-[14px] text-ink-muted">
            No muscle suggestions made yet this cycle.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {existing.data.map((s) => {
              const linkedGoal = goalText(s.relatedGoalId);
              return (
                <li
                  key={s.id}
                  className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-display text-[16px] leading-snug text-ink">
                      {s.muscle}{' '}
                      <span className="text-ink-muted">
                        · {SIDE_LABEL[s.side]}
                      </span>
                    </p>
                    <span className="shrink-0 rounded-full border border-stone bg-cream px-2 py-0.5 text-[12px] uppercase tracking-wider text-ink-muted">
                      {physioSuggestionStatusLabel(s.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                    {s.rationale}
                  </p>
                  {linkedGoal && (
                    <p className="mt-2 text-[13px] text-ink-muted">
                      Related goal: {linkedGoal}
                    </p>
                  )}
                  <p className="mt-2 text-[13px] text-ink-muted">
                    {formatLongDate(s.createdAt.slice(0, 10), locale)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
