'use client';

/**
 * Route-level error boundary for all locale routes. Catches render-time
 * crashes within a page (in place, keeping the locale layout/theme/fonts),
 * reports them to Sentry, and shows the calm ErrorState with a retry that
 * re-renders the segment. The whole-document `app/global-error.tsx` remains
 * the last-resort fallback if the layout itself fails.
 */
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { ErrorState } from '@/components/feedback/ErrorState';

export default function LocaleError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream">
      <ErrorState onRetry={reset} />
    </div>
  );
}
