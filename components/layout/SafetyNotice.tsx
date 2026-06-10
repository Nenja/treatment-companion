'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ReadAloudButton } from '@/components/feedback/ReadAloudButton';

/**
 * Static safety notice. Wording is fixed by the regulatory brief and must
 * not be altered without review (messages/{locale}.json -> "safety.*").
 *
 * The headline ("Not for urgent care") is ALWAYS visible so the patient can
 * never miss that an urgent-care caveat exists; only the detailed guidance
 * sits behind a tap, to keep the home screen compact.
 */
export function SafetyNotice() {
  const t = useTranslations('safety');
  const [open, setOpen] = useState(false);

  return (
    <aside
      role="note"
      aria-label={t('title')}
      className="border-t border-stone/60 px-0.5 pt-4 text-[14px] leading-relaxed text-ink-soft"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-soft text-amber-deep"
          >
            <span className="font-display text-[12px] leading-none">i</span>
          </span>
          <span className="font-semibold text-ink">{t('title')}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-ink-soft">
            {t('whatToDo')}
          </span>
          <span
            aria-hidden
            className={`text-[13px] text-ink-muted transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          >
            ▾
          </span>
        </span>
      </button>
      {open && (
        <div className="mt-3 flex items-start justify-between gap-2 border-t border-stone/60 pt-3">
          <p className="flex-1">{t('body')}</p>
          <ReadAloudButton text={`${t('title')}. ${t('body')}`} />
        </div>
      )}
    </aside>
  );
}
