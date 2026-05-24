/**
 * Sentry — browser runtime. Loaded automatically by @sentry/nextjs.
 *
 * Privacy rules live in lib/sentry.shared.ts and are spread in here so
 * every runtime scrubs identically. See that file for the rationale.
 */
import * as Sentry from '@sentry/nextjs';
import { sentryBaseOptions, SENTRY_DSN } from '@/lib/sentry.shared';

if (SENTRY_DSN) {
  Sentry.init({
    ...sentryBaseOptions
    // No integrations added: no BrowserTracing, no Replay. Error
    // capture only — the default integrations cover that.
  });
}
