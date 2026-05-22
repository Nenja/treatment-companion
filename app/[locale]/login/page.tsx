'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If a session already exists when the user lands here, send them on.
  useEffect(() => {
    if (loading) return;
    if (user && profile) {
      // Each role has its own landing area. Patients land on the
      // home/check-in surface at root; physicians on /clinician;
      // physiotherapists on /physio. Admin has no dedicated landing
      // (admin tasks are reached from the clinician unlock screen).
      let target = '/';
      if (profile.role === 'clinician') target = '/clinician';
      else if (profile.role === 'physiotherapist') target = '/physio';
      router.replace(
        locale === 'en'
          ? target
          : `/${locale}${target === '/' ? '' : target}`
      );
    }
  }, [loading, user, profile, router, locale]);

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
      setError(signInError.message);
      setSubmitting(false);
      return;
    }

    // The auth state listener in AuthProvider will pick up the new
    // session and the useEffect above will redirect.
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
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[16px] text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-[14px] text-amber-deep" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-cream-soft hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-muted"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  );
}
