/**
 * Sentry — browser runtime.
 *
 * This is Next.js's native client instrumentation hook (formerly
 * `sentry.client.config.ts`). Next.js loads it automatically in the browser
 * bundle, so it works WITHOUT wrapping next.config in `withSentryConfig`.
 * Renamed per Sentry's guidance: a `sentry.client.config.(js|ts)` can be
 * renamed to `instrumentation-client.(js|ts)` on all Next.js versions.
 *
 * Privacy rules live in lib/sentry.shared.ts and are spread in here so every
 * runtime (browser, server, edge) scrubs identically. See that file for the
 * rationale. If NEXT_PUBLIC_SENTRY_DSN is unset, init is skipped and nothing
 * is captured (safe no-op for local dev / before the DSN is configured).
 */
import * as Sentry from '@sentry/nextjs';
import { sentryBaseOptions, SENTRY_DSN } from '@/lib/sentry.shared';

if (SENTRY_DSN) {
  Sentry.init({
    ...sentryBaseOptions
    // No integrations added: no BrowserTracing, no Replay. Error capture
    // only — the default integrations cover that. (If you later enable
    // tracing — tracesSampleRate > 0 — also add:
    //   export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
    // to instrument client-side navigations.)
  });
}
