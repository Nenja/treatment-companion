'use client';

import { useTranslations } from 'next-intl';

/**
 * Calm, on-brand error state shown when data can't be loaded.
 *
 * Used in two places: as the fallback for the route-level error boundary
 * (app/[locale]/error.tsx), and inline on data pages when a query reports
 * `isError` — so a failed fetch surfaces a retry instead of hanging on a
 * loading skeleton forever. Copy mirrors the app's other error voice
 * (reassuring, points to the clinic if it persists).
 */
export function ErrorState({
  onRetry,
  title,
  message
}: {
  onRetry?: () => void;
  title?: string;
  message?: string;
}) {
  const t = useTranslations('errorState');
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-sm flex-col items-center px-6 py-16 text-center"
    >
      <h2 className="font-display text-[20px] leading-tight text-ink">
        {title ?? t('title')}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        {message ?? t('body')}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex min-h-[44px] items-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-sage"
        >
          {t('retry')}
        </button>
      )}
    </div>
  );
}
