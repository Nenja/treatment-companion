'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

interface CatchUpPrompt {
  id: string;
  weekNumber: number;
  dueDate: string;
}

interface CatchUpCardProps {
  prompts: CatchUpPrompt[];
}

/**
 * Quiet secondary card that appears under the main check-in CTA when
 * the patient has pending prompts from the previous 1–2 weeks (within
 * the catch-up window). Collapsed by default — tapping the button
 * expands to a list of week numbers; tapping a week opens that week's
 * check-in.
 *
 * Older pending prompts beyond the catch-up window are not shown at
 * all (handled in the home query).
 *
 * Tone: gentle, no urgency. We don't want the patient to feel judged
 * for missing a week.
 */
export function CatchUpCard({ prompts }: CatchUpCardProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('patient.home');
  const [expanded, setExpanded] = useState(false);

  // Sort newest-first so the most recent missed week appears at the top.
  const sorted = [...prompts].sort((a, b) => b.weekNumber - a.weekNumber);

  const goToCheckin = (promptId: string) => {
    const base = locale === 'en' ? '/checkin' : `/${locale}/checkin`;
    router.push(`${base}?promptId=${promptId}`);
  };

  return (
    <div className="mt-2 border-b border-stone/60 px-0.5 py-3">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-[14px] text-ink-soft">
          {t('catchUpTitle', { count: prompts.length })}
        </span>
        <span
          aria-hidden
          className={`text-[14px] text-ink-muted transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
      </button>
      {expanded && (
        <ul className="mt-2 space-y-1.5 border-t border-stone/70 pt-3">
          {sorted.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => goToCheckin(p.id)}
                className="flex w-full items-center justify-between rounded-[var(--radius-button)] px-2 py-2 text-left text-[14px] text-ink hover:bg-stone-soft"
              >
                <span>{t('catchUpWeek', { week: p.weekNumber })}</span>
                <span aria-hidden className="text-[14px] text-ink-muted">
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
