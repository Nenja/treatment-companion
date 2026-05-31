'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { useAuth } from '@/lib/supabase/auth';

/**
 * Email + password login. On success the AuthProvider picks up the new
 * session and refreshes the user/profile, then this page redirects
 * based on the resolved profile role.
 */
export default function LoginPage() {
  const router = useRouter();
  const locale = useLocale();
  const { user, profile, loading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefix = locale === 'en' ? '' : `/${locale}`;

  // If a session already exists when the user lands here, send them on.
  useEffect(() => {
    if (loading) return;
    if (user && profile) {
      // An account still on its temporary password goes straight to
      // set-password — not to its role home.
      if (profile.mustChangePassword) {
        router.replace(`${prefix}/reset-password`);
        return;
      }
      let target = '/';
      if (profile.role === 'clinician') target = '/clinician';
      else if (profile.role === 'physiotherapist') target = '/physio';
      router.replace(
        locale === 'en'
          ? target
          : `/${locale}${target === '/' ? '' : target}`
      );
    }
  }, [loading, user, profile, router, locale, prefix]);

  /**
   * Turn a raw Supabase auth error into a short, plain-language message
   * that tells the person what to DO. We never show Supabase's raw
   * string to the user — it's technical and gives no next step.
   */
  const friendlyError = (raw: string): string => {
    const m = raw.toLowerCase();
    if (m.includes('invalid login') || m.includes('credentials')) {
      return 'That email or password didn\u2019t match. Check both and try again \u2014 or use "Forgot password?" below.';
    }
    if (m.includes('email not confirmed')) {
      return 'This account isn\u2019t activated yet. Please contact your clinic.';
    }
    if (m.includes('rate limit') || m.includes('too many')) {
      return 'Too many attempts. Please wait a minute, then try again.';
    }
    if (m.includes('network') || m.includes('fetch')) {
      return 'Network problem. Check your connection and try again.';
    }
    return 'Something went wrong signing in. Please try again.';
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (signInError) {
      setError(friendlyError(signInError.message));
      setSubmitting(false);
      return;
    }
    // The auth state listener in AuthProvider picks up the new session
    // and the useEffect above redirects.
  };

  return (
    <div className="min-h-dvh bg-cream">
      <main className="mx-auto max-w-[420px] px-5 py-12">
        <h1 className="font-display text-[28px] leading-tight text-ink">
          Sign in
        </h1>
        <p className="mt-2 text-[15px] text-ink-soft">
          Use the email and password your clinic gave you.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-[14px] font-semibold text-ink"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[16px] text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[14px] font-semibold text-ink"
            >
              Password
            </label>
            <div className="relative mt-1.5">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft py-2.5 pl-3 pr-20 text-[16px] text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
              />
              {/* Show/hide toggle — lets the person verify a clinic-
                  issued password they're typing on a phone. */}
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-[14px] font-semibold text-sage-deep hover:text-ink"
              >
                {showPassword ? 'Hide' : 'Show'}
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

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-soft"
          >
            {submitting ? 'Signing in\u2026' : 'Sign in'}
          </button>
        </form>

        {/* Forgot password — the recovery path for a locked-out user. */}
        <p className="mt-6 text-center text-[14px]">
          <Link
            href={`${prefix}/forgot-password`}
            className="font-semibold text-sage-deep hover:text-ink"
          >
            Forgot password?
          </Link>
        </p>

        <p className="mt-4 text-center text-[14px] text-ink-soft">
          New here?{' '}
          <Link
            href={`${prefix}/signup`}
            className="font-semibold text-sage-deep hover:text-ink"
          >
            Create an account
          </Link>
        </p>

        <p className="mt-4 text-center text-[13px]">
          <Link
            href={`${prefix}/privacy`}
            className="text-ink-muted hover:text-ink-soft"
          >
            Your data &amp; privacy
          </Link>
        </p>
      </main>
    </div>
  );
}
