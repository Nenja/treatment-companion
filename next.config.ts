import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/**
 * Content-Security-Policy.
 *
 * ENFORCED (2026-06-16). Previously shipped Report-Only and validated by
 * clicking through patient, clinician and physiotherapist flows on staging
 * (Preview) watching for violations, then enforced by renaming the header at
 * the bottom from `Content-Security-Policy-Report-Only` to
 * `Content-Security-Policy`. If a future change adds a resource from a new
 * domain, widen the matching directive below (and re-validate on staging).
 *
 * Notes on the directives:
 *  - script/style allow 'unsafe-inline' (+ 'unsafe-eval' for scripts) because
 *    Next.js injects inline hydration code; a stricter nonce-based policy is a
 *    later refinement.
 *  - connect-src allows Supabase (REST + realtime websocket) and Sentry ingest.
 *  - media/img allow Supabase Storage (signed video URLs) and blobs (recording).
 *  - worker-src allows the service worker + blob workers.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.ingest.us.sentry.io",
  "media-src 'self' blob: https://*.supabase.co",
  "worker-src 'self' blob:"
].join('; ');

/**
 * Security headers applied to every response. These are all low-risk and
 * enforced (unlike the CSP above). HSTS only takes effect over HTTPS, which
 * Vercel always serves.
 */
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains'
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    // Allow camera + microphone for the goal-video recorder (same-origin only);
    // deny the rest and opt out of FLoC/Topics.
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(self), geolocation=(), browsing-topics=()'
  },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // ENFORCED 2026-06-16 (was Content-Security-Policy-Report-Only). The policy
  // keeps 'unsafe-inline'/'unsafe-eval' (Next hydration), so this enforces the
  // source allow-list + clickjacking/object-src/base-uri lockdowns without
  // breaking framework code. Validated on staging (Preview) before production.
  // Follow-up (P1): nonce-based policy to drop 'unsafe-inline' — see docs/ROADMAP.md.
  { key: 'Content-Security-Policy', value: csp }
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  }
};

export default withNextIntl(nextConfig);
