import { useTranslations } from 'next-intl';

/**
 * Static safety notice. Wording is fixed by the regulatory brief and must
 * not be altered without review. Lives in messages/{locale}.json under
 * "safety.body" so it can be translated, not paraphrased.
 */
export function SafetyNotice() {
  const t = useTranslations('safety');

  return (
    <aside
      role="note"
      aria-label={t('title')}
      className="rounded-[var(--radius-card)] border border-stone bg-cream-soft/70 p-4 text-[14px] leading-relaxed text-ink-soft"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-soft text-amber-deep"
        >
          {/* Plain "i" — no alarming colour, no pictogram */}
          <span className="font-display text-[14px] leading-none">i</span>
        </span>
        <div>
          <p className="font-semibold text-ink">{t('title')}</p>
          <p className="mt-1">{t('body')}</p>
        </div>
      </div>
    </aside>
  );
}
