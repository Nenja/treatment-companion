/**
 * Sentry — Edge runtime (middleware, edge routes). Loaded via
 * instrumentation.ts.
 *
 * Privacy rules live in lib/sentry.shared.ts. See that file.
 */
import * as Sentry from '@sentry/nextjs';
import { sentryBaseOptions, SENTRY_DSN } from '@/lib/sentry.shared';

if (SENTRY_DSN) {
  Sentry.init({
    ...sentryBaseOptions
  });
}
