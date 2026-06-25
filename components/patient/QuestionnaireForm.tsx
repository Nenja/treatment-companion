'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useQuestionnaireItems,
  useSubmitQuestionnaireResponse,
  type QuestionnaireItem
} from '@/lib/supabase/questionnaires';

/**
 * Renders ONE due questionnaire as a patient-facing form on the post-check-in
 * screen and submits raw answers. No score is shown or computed.
 *
 * Answer encoding (raw): nrs/number -> the number as text; boolean ->
 * 'true'/'false'; single_choice/likert -> the chosen option value;
 * multi_choice -> JSON array of chosen values; text -> the text.
 */
export function QuestionnaireForm({
  questionnaireId,
  title,
  weeklyCheckinId,
  assignmentId,
  step,
  onDone
}: {
  questionnaireId: string;
  title: string;
  weeklyCheckinId: string;
  assignmentId: string | null;
  step?: { current: number; total: number };
  onDone: () => void;
}) {
  const t = useTranslations('questionnaireFill');
  const itemsQuery = useQuestionnaireItems(questionnaireId);
  const submit = useSubmitQuestionnaireResponse();

  // item_key -> raw value (multi_choice keeps a string[] internally).
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [error, setError] = useState<string | null>(null);

  const items = itemsQuery.data ?? [];

  function setVal(key: string, v: string | string[]) {
    setValues((s) => ({ ...s, [key]: v }));
  }
  function toggleMulti(key: string, optionValue: string) {
    setValues((s) => {
      const cur = Array.isArray(s[key]) ? (s[key] as string[]) : [];
      const next = cur.includes(optionValue)
        ? cur.filter((v) => v !== optionValue)
        : [...cur, optionValue];
      return { ...s, [key]: next };
    });
  }

  function isAnswered(item: QuestionnaireItem): boolean {
    const v = values[item.item_key];
    if (Array.isArray(v)) return v.length > 0;
    return v != null && v !== '';
  }

  async function onSubmit() {
    setError(null);
    const missing = items.filter((i) => i.required && !isAnswered(i));
    if (missing.length > 0) {
      setError(t('requiredMissing'));
      return;
    }
    const answers = items
      .filter((i) => isAnswered(i))
      .map((i) => {
        const v = values[i.item_key];
        return {
          item_key: i.item_key,
          value: Array.isArray(v) ? JSON.stringify(v) : String(v)
        };
      });
    try {
      await submit.mutateAsync({
        questionnaireId,
        answers,
        weeklyCheckinId,
        assignmentId
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col px-5 py-8">
      {step && step.total > 1 && (
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
          {t('step', { current: step.current, total: step.total })}
        </p>
      )}
      <h1 className="mt-1 font-display text-[22px] leading-tight text-ink">
        {title}
      </h1>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">
        {t('intro')}
      </p>

      {itemsQuery.isLoading ? (
        <p className="mt-6 text-[14px] text-ink-muted">{t('loading')}</p>
      ) : (
        <div className="mt-6 space-y-6">
          {items.map((item) => (
            <fieldset key={item.id} className="border-0 p-0">
              <legend className="text-[15px] font-semibold text-ink">
                {item.prompt}
                {item.required && (
                  <span aria-hidden className="text-amber-deep">
                    {' '}
                    *
                  </span>
                )}
              </legend>
              <div className="mt-3">
                {renderItem(item, values[item.item_key], setVal, toggleMulti, t)}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-[var(--radius-card)] border border-amber-deep/40 bg-amber-soft/40 p-3 text-[13px] text-ink"
        >
          {error}
        </p>
      )}

      <div className="mt-8">
        <button
          type="button"
          onClick={onSubmit}
          disabled={submit.isPending || itemsQuery.isLoading}
          className="w-full rounded-[var(--radius-button)] border border-sage-deep bg-sage-deep px-4 py-3 text-[16px] font-semibold text-on-accent transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {submit.isPending ? t('submitting') : t('submit')}
        </button>
      </div>
    </div>
  );
}

type TFn = ReturnType<typeof useTranslations>;

function renderItem(
  item: QuestionnaireItem,
  raw: string | string[] | undefined,
  setVal: (key: string, v: string | string[]) => void,
  toggleMulti: (key: string, optionValue: string) => void,
  t: TFn
) {
  const value = typeof raw === 'string' ? raw : '';
  const multi = Array.isArray(raw) ? raw : [];

  switch (item.item_type) {
    case 'nrs_0_10':
      return (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={item.prompt}>
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === String(n)}
              onClick={() => setVal(item.item_key, String(n))}
              className={`h-11 w-11 rounded-[var(--radius-button)] border text-[15px] font-semibold transition-colors ${
                value === String(n)
                  ? 'border-sage-deep bg-sage-deep text-on-accent'
                  : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      );

    case 'number':
      return (
        <input
          type="number"
          inputMode="numeric"
          aria-label={item.prompt}
          min={item.min_value ?? undefined}
          max={item.max_value ?? undefined}
          value={value}
          onChange={(e) => setVal(item.item_key, e.target.value)}
          className="w-32 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2 text-[15px] text-ink"
        />
      );

    case 'text':
      return (
        <textarea
          value={value}
          aria-label={item.prompt}
          onChange={(e) => setVal(item.item_key, e.target.value)}
          rows={3}
          className="w-full rounded-[var(--radius-card)] border border-stone bg-cream-soft px-3 py-2 text-[15px] text-ink"
        />
      );

    case 'boolean':
      return (
        <div className="flex gap-2" role="radiogroup" aria-label={item.prompt}>
          {[
            { v: 'true', label: t('yes') },
            { v: 'false', label: t('no') }
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={value === o.v}
              onClick={() => setVal(item.item_key, o.v)}
              className={`flex-1 rounded-[var(--radius-button)] border px-4 py-2.5 text-[15px] font-semibold transition-colors ${
                value === o.v
                  ? 'border-sage-deep bg-sage-deep text-on-accent'
                  : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      );

    case 'single_choice':
    case 'likert':
      return (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label={item.prompt}>
          {(item.options ?? []).map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={value === o.value}
              onClick={() => setVal(item.item_key, o.value)}
              className={`rounded-[var(--radius-button)] border px-4 py-2.5 text-left text-[15px] transition-colors ${
                value === o.value
                  ? 'border-sage-deep bg-sage-deep text-on-accent'
                  : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      );

    case 'multi_choice':
      return (
        <div className="flex flex-col gap-2">
          {(item.options ?? []).map((o) => {
            const checked = multi.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggleMulti(item.item_key, o.value)}
                className={`flex items-center gap-2 rounded-[var(--radius-button)] border px-4 py-2.5 text-left text-[15px] transition-colors ${
                  checked
                    ? 'border-sage-deep bg-sage-deep text-on-accent'
                    : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-4 items-center justify-center rounded-sm border ${
                    checked ? 'border-on-accent' : 'border-stone'
                  }`}
                >
                  {checked ? '✓' : ''}
                </span>
                {o.label}
              </button>
            );
          })}
        </div>
      );

    default:
      return null;
  }
}
