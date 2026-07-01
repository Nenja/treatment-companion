'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useToast } from '@/components/feedback/Toast';
import { classifyError } from '@/lib/feedback';
import { formatLongDate } from '@/lib/dates';
import { physioSuggestionStatusLabel } from '@/lib/physioSuggestionStatus';
import {
  useSubmitPhysioGoalSuggestion,
  usePhysioGoalSuggestions
} from '@/lib/supabase/physioGoalSuggestion';

interface PhysioGoalSuggestionFormProps {
  patientId: string;
}

/**
 * Physiotherapist goal-suggestion surface.
 *
 * The physiotherapist recommends a new treatment goal for the physician
 * to consider at the next injection visit: a suggested goal in clinical
 * language plus a rationale. Below the form, suggestions already made
 * this cycle are listed with their review status.
 */
export function PhysioGoalSuggestionForm({
  patientId
}: PhysioGoalSuggestionFormProps) {
  const toast = useToast();
  const locale = useLocale();
  const t = useTranslations('physioForms');
  const submit = useSubmitPhysioGoalSuggestion();
  const existing = usePhysioGoalSuggestions(patientId, true);

  const [goal, setGoal] = useState('');
  const [rationale, setRationale] = useState('');

  const canSubmit =
    goal.trim().length > 0 &&
    rationale.trim().length > 0 &&
    !submit.isPending;

  const doSubmit = async () => {
    if (!canSubmit) return;
    try {
      await submit.mutateAsync({
        patientId,
        suggestedGoal: goal.trim(),
        rationale: rationale.trim()
      });
      toast.success(t('goalToast'));
      setGoal('');
      setRationale('');
    } catch (err) {
      toast.error(
        classifyError(err) === 'errorGeneric'
          ? t('goalError')
          : t('goalErrorShort')
      );
    }
  };

  return (
    <div>
      <section className="mt-6">
        <h2 className="font-display text-[20px] text-ink">{t('goalSuggestTitle')}</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{t('goalSuggestHint')}</p>

        <div className="mt-5">
          <label
            htmlFor="physio-goal"
            className="block text-[14px] font-semibold text-ink"
          >{t('goalSuggestedLabel')}</label>
          <textarea
            id="physio-goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
            maxLength={500}
            className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-ink-muted bg-cream-soft px-3 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
            placeholder={t('goalPlaceholder')}
          />
        </div>

        <div className="mt-5">
          <label
            htmlFor="physio-rationale"
            className="block text-[14px] font-semibold text-ink"
          >{t('rationaleLabel')}</label>
          <p className="mt-0.5 text-[14px] text-ink-muted">{t('goalRationaleHint')}</p>
          <textarea
            id="physio-rationale"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={4}
            maxLength={1000}
            className="mt-2 block w-full rounded-[var(--radius-button)] border border-ink-muted bg-cream-soft px-3 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
            placeholder={t('goalRationalePlaceholder')}
          />
        </div>

        <button
          type="button"
          onClick={doSubmit}
          disabled={!canSubmit}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submit.isPending ? t('goalSending') : t('goalSend')}
        </button>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-[20px] text-ink">{t('goalSuggestionsMadeTitle')}</h2>
        {existing.isLoading ? (
          <p className="mt-3 text-[14px] text-ink-muted">{t('loading')}</p>
        ) : !existing.data || existing.data.length === 0 ? (
          <p className="mt-3 text-[14px] text-ink-muted">{t('goalSuggestionsEmpty')}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {existing.data.map((s) => (
              <li
                key={s.id}
                className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-display text-[16px] leading-snug text-ink">
                    {s.suggestedGoal}
                  </p>
                  <span className="shrink-0 rounded-full border border-stone bg-cream px-2 py-0.5 text-[12px] uppercase tracking-wider text-ink-muted">
                    {physioSuggestionStatusLabel(s.status)}
                  </span>
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                  {s.rationale}
                </p>
                <p className="mt-2 text-[13px] text-ink-muted">
                  {formatLongDate(s.createdAt.slice(0, 10), locale)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
