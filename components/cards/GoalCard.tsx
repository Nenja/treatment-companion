'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { ApprovedGoal } from '@/lib/types';
import { formatLongDate } from '@/lib/dates';

interface GoalCardProps {
  goal: ApprovedGoal;
  reviewDate: string;
}

export function GoalCard({ goal, reviewDate }: GoalCardProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  const anchors = [
    { key: 'minus2', label: t('goal.anchorMinus2Label'), text: goal.gasAnchors.minus2 },
    { key: 'minus1', label: t('goal.anchorMinus1Label'), text: goal.gasAnchors.minus1 },
    { key: 'zero', label: t('goal.anchorZeroLabel'), text: goal.gasAnchors.zero },
    { key: 'plus1', label: t('goal.anchorPlus1Label'), text: goal.gasAnchors.plus1 },
    { key: 'plus2', label: t('goal.anchorPlus2Label'), text: goal.gasAnchors.plus2 }
  ];

  return (
    <article className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5">
      <h3 className="font-display text-[20px] leading-snug text-ink">
        {goal.patientFacingText}
      </h3>

      <p className="mt-2 text-[13px] text-ink-muted">
        {t('goal.reviewDate', { date: formatLongDate(reviewDate, locale) })}
      </p>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={t('goal.howMeasuredTitle')}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-stone-soft hover:text-ink-soft"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 16 16"
            aria-hidden
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path
              d="M4 6 L8 10 L12 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {open && (
        <div className="mt-3">
          <ol className="space-y-2">
            {anchors.map((a) => {
              const isZero = a.key === 'zero';
              return (
                <li
                  key={a.key}
                  className={`rounded-[var(--radius-button)] px-3 py-2.5 ${
                    isZero
                      ? 'bg-sage-soft border-l-[3px] border-sage'
                      : 'bg-cream border border-stone'
                  }`}
                >
                  <div
                    className={`text-[11px] font-semibold uppercase tracking-wider ${
                      isZero ? 'text-sage-deep' : 'text-ink-muted'
                    }`}
                  >
                    {a.label}
                  </div>
                  <div className="mt-0.5 text-[14px] leading-relaxed text-ink">
                    {a.text}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </article>
  );
}
