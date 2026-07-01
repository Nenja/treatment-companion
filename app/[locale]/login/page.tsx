'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { useAuth } from '@/lib/supabase/auth';
import { LanguageSelect } from '@/components/settings/LanguageSelect';
import { VersionTag } from '@/components/layout/VersionTag';

/**
 * Whether to show the raw technical detail (Supabase code / HTTP status /
 * message) under a login error. Shown only outside production — local dev and
 * Vercel preview — because on the production login screen it would leak
 * server/config internals to anyone. Fails CLOSED: if the environment can't be
 * positively identified as dev/preview, the detail is hidden. To see it on a
 * preview deploy, set NEXT_PUBLIC_VERCEL_ENV (or NEXT_PUBLIC_SENTRY_ENVIRONMENT)
 * in the Vercel env vars — the same signal Sentry uses.
 */
const SHOW_LOGIN_ERROR_DETAIL =
  process.env.NODE_ENV === 'development' ||
  (process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    process.env.NEXT_PUBLIC_VERCEL_ENV) === 'preview';

/**
 * Email + password login. On success the AuthProvider picks up the new
 * session and refreshes the user/profile, then this page redirects
 * based on the resolved profile role.
 */
export default function LoginPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('login');
  const tSupport = useTranslations('support');
  const { user, profile, loading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Technical detail (code/status/message) shown only for the non-obvious
  // failures — a wrong password stays clean. Pre-pilot diagnostic aid.
  const [detail, setDetail] = useState<string | null>(null);

  const prefix = locale === 'en' ? '' : `/${locale}`;

  // If a session already exists when the user lands here, send them on.
  useEffect(() => {
    if (loading) return;
    if (user && profile) {
      // Apply the user's saved interface language on sign-in: route to
      // their preferred locale's path rather than whatever language the
      // login page happened to be in. Falls back to the current locale
      // when no preference is stored. (The pre-auth links below keep using
      // the current-locale `prefix`.)
      const loc = profile.preferredLocale ?? locale;
      const pfx = loc === 'en' ? '' : `/${loc}`;
      // An account still on its temporary password goes straight to
      // set-password — not to its role home.
      if (profile.mustChangePassword) {
        router.replace(`${pfx}/reset-password`);
        return;
      }
      let target = '/';
      if (profile.role === 'clinician') target = '/clinician';
      else if (profile.role === 'physiotherapist') target = '/physio';
      router.replace(
        loc === 'en' ? target : `/${loc}${target === '/' ? '' : target}`
      );
    }
  }, [loading, user, profile, router, locale, prefix]);

  /**
   * Turn a raw Supabase auth error into a short, plain-language message
   * that tells the person what to DO. We never show Supabase's raw
   * string to the user — it's technical and gives no next step.
   */
  const friendlyError = (raw: string, status?: number): string => {
    const m = raw.toLowerCase();
    if (m.includes('invalid login') || m.includes('credentials')) {
      return t('errInvalid');
    }
    if (m.includes('email not confirmed')) {
      return t('errNotActivated');
    }
    if (m.includes('rate limit') || m.includes('too many')) {
      return t('errRateLimit');
    }
    if (m.includes('network') || m.includes('fetch')) {
      return t('errNetwork');
    }
    // A 500 / "database error" / "unexpected" is a server- or config-side
    // failure (email logins disabled, a broken auth trigger, the project
    // paused, ...) — NOT the person's password. Say so, so they don't keep
    // retrying credentials that are actually correct.
    if (status === 500 || m.includes('database error') || m.includes('unexpected')) {
      return t('errServer');
    }
    return t('errGeneric');
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setDetail(null);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (signInError) {
      const code = (signInError as { code?: string }).code;
      const status = (signInError as { status?: number }).status;
      const raw = signInError.message;
      // Log the real error — friendlyError deliberately hides it from the UI.
      console.error('[login] signInWithPassword failed:', { code, status, raw });
      setError(friendlyError(raw, status));
      // Technical detail (code / HTTP status / raw message) helps diagnose a
      // non-credential failure, but it must not reach real users on production
      // — gate it to dev/preview. The raw error is still logged above and
      // captured by Sentry regardless.
      const isCredential =
        code === 'invalid_credentials' ||
        /invalid login|credentials|email not confirmed/i.test(raw);
      setDetail(
        !SHOW_LOGIN_ERROR_DETAIL || isCredential
          ? null
          : [code, status ? `HTTP ${status}` : null, raw]
              .filter(Boolean)
              .join(' · ')
      );
      setSubmitting(false);
      return;
    }
    // The auth state listener in AuthProvider picks up the new session
    // and the useEffect above redirects.
  };

  return (
    <div className="min-h-dvh bg-cream">
      <main className="mx-auto max-w-[420px] px-5 py-12">
        {/* Language — lets a user read the page in their language before
            signing in. Pre-auth, so it only switches the URL locale. */}
        <div className="mb-6 flex justify-end">
          <LanguageSelect variant="segmented" />
        </div>
        <h1 className="font-display text-[28px] leading-tight text-ink">
          {t('title')}
        </h1>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-[14px] font-semibold text-ink"
            >
              {t('emailLabel')}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-ink-muted bg-cream-soft px-3 py-2.5 text-[16px] text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[14px] font-semibold text-ink"
            >
              {t('passwordLabel')}
            </label>
            <div className="relative mt-1.5">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="block w-full rounded-[var(--radius-button)] border border-ink-muted bg-cream-soft py-2.5 pl-3 pr-20 text-[16px] text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
              />
              {/* Show/hide toggle — lets the person verify a clinic-
                  issued password they're typing on a phone. */}
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-[14px] font-semibold text-sage-deep hover:text-ink"
              >
                {showPassword ? t('hide') : t('show')}
              </button>
            </div>
          </div>

          {error && (
            <p
              className="rounded-[var(--radius-button)] border border-amber-deep/40 bg-amber-soft px-3 py-2.5 text-[14px] leading-relaxed text-ink"
              role="alert"
            >
              {error}
            </p>
          )}
          {detail && (
            <p className="-mt-2 break-words font-mono text-[11.5px] leading-snug text-ink-muted">
              {detail}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-soft"
          >
            {submitting ? t('submitting') : t('submit')}
          </button>
        </form>

        {/* Forgot password — the recovery path for a locked-out user. */}
        <p className="mt-6 text-center text-[14px]">
          <Link
            href={`${prefix}/forgot-password`}
            className="font-semibold text-sage-deep hover:text-ink"
          >
            {t('forgotPassword')}
          </Link>
        </p>

        <p className="mt-4 text-center text-[14px] text-ink-soft">
          {t('newHere')}{' '}
          <Link
            href={`${prefix}/signup`}
            className="font-semibold text-sage-deep hover:text-ink"
          >
            {t('createAccount')}
          </Link>
        </p>

        <p className="mt-4 text-center text-[13px]">
          <Link
            href={`${prefix}/privacy`}
            className="text-ink-muted hover:text-ink-soft"
          >
            {t('privacyLink')}
          </Link>
          <span className="mx-2 text-ink-muted" aria-hidden>·</span>
          <Link
            href={`${prefix}/support`}
            className="text-ink-muted hover:text-ink-soft"
          >
            {tSupport('loginLink')}
          </Link>
        </p>
        <VersionTag className="mt-6 block text-center text-[11px] text-ink-muted" />
      </main>
    </div>
  );
}
