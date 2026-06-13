/**
 * Shared Sentry configuration — privacy-first.
 *
 * This app handles identifiable EU patients' health data, so error
 * monitoring must NOT become a backdoor that ships health data to a
 * third party. Every Sentry config (client, server, edge) spreads
 * `sentryBaseOptions` so the scrubbing rules are identical everywhere
 * and can't drift.
 *
 * What this enforces:
 *   - sendDefaultPii: false — Sentry does not attach IP addresses,
 *     cookies, user identifiers, or request headers by default.
 *   - beforeSend strips request data, query strings, and breadcrumb
 *     URLs that could carry a goal text, a patient name, a token, etc.
 *   - No session replay, no profiling — error events only.
 *
 * The DSN comes from NEXT_PUBLIC_SENTRY_DSN. If it is unset (e.g. local
 * dev), Sentry initialises to a no-op and captures nothing — safe.
 *
 * NOTE for the regulatory review: Sentry is a third-party data
 * processor. Use an EU-hosted Sentry project so error events stay in
 * the EU, and include Sentry in the data-processing inventory.
 */
import type { ErrorEvent } from '@sentry/nextjs';

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Tag every event with the deploy environment and the release, so issues in
 * Sentry are attributable to a specific deploy and preview-deploy noise can be
 * filtered out of production. On Vercel the server runtime resolves these
 * automatically; for the BROWSER bundle, set NEXT_PUBLIC_SENTRY_ENVIRONMENT
 * (e.g. "production") — and optionally NEXT_PUBLIC_SENTRY_RELEASE — in the
 * Vercel project env vars. If nothing resolves, Sentry simply leaves the tag
 * empty (harmless).
 */
const SENTRY_ENVIRONMENT =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
  process.env.NEXT_PUBLIC_VERCEL_ENV ??
  process.env.VERCEL_ENV;

const SENTRY_RELEASE =
  process.env.NEXT_PUBLIC_SENTRY_RELEASE ??
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
  process.env.VERCEL_GIT_COMMIT_SHA;

/**
 * Remove anything from an outgoing event that could carry patient or
 * health data. Conservative by design — when unsure, strip it.
 */
function scrubEvent(event: ErrorEvent): ErrorEvent {
  // Drop the whole request body / cookies / headers — a POST to a
  // check-in or goal endpoint would otherwise carry clinical content.
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    // Keep only the path of the URL, never the query string (which can
    // hold ids, tokens, ?patient=...).
    if (event.request.url) {
      event.request.url = event.request.url.split('?')[0];
    }
    if (event.request.query_string) {
      delete event.request.query_string;
    }
  }

  // Never send user identifiers. sendDefaultPii:false covers most of
  // this, but be explicit.
  if (event.user) {
    event.user = {};
  }

  // Scrub breadcrumb URLs (navigation/fetch breadcrumbs can include
  // query strings with ids).
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => {
      if (b.data && typeof b.data.url === 'string') {
        b.data.url = b.data.url.split('?')[0];
      }
      // fetch/xhr breadcrumbs can carry request/response bodies.
      if (b.data) {
        delete b.data.request_body;
        delete b.data.response_body;
      }
      return b;
    });
  }

  return event;
}

export const sentryBaseOptions = {
  dsn: SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,
  release: SENTRY_RELEASE,
  // Error events only — no performance traces, no profiling, no replay.
  // A small pilot needs "did something break", nothing heavier, and
  // every extra data stream is more to scrub and more to justify.
  tracesSampleRate: 0,
  // Do NOT attach IP, cookies, request headers, user agent by default.
  sendDefaultPii: false,
  // Final scrub before anything leaves the app.
  beforeSend(event: ErrorEvent): ErrorEvent | null {
    if (!SENTRY_DSN) return null;
    return scrubEvent(event);
  }
};
