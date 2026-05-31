'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

/**
 * Forgot-password request screen.
 *
 * The person enters their email; Supabase sends a reset link. The link
 * carries a recovery token and lands on /reset-password, where they
 * set a new password.
 *
 * We always show the same confirmation regardless of whether the email
 * matched an account — telling an anonymous visitor "no account with
 * that email" would leak which emails are registered.
 */
export default function ForgotPasswordPage() {
  const locale = useLocale();
  const prefix = locale === 'en' ? '' : `/${locale}`;

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    // The redirect target must be on an allowed redirect URL in the
    // Supabase Auth settings (see the setup notes shipped with this
    // slice). origin is used so it works on both the Vercel domain and
    // any preview deploys.
    const redirectTo = `${window.location.origin}${prefix}/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo }
    );

    if (resetError) {
      // A genuine failure (network, rate limit) — surface it. We do NOT
      // surface "user not found"; Supabase doesn't return that here.
      const m = resetError.message.toLowerCase();
      setError(
        m.includes('rate') || m.includes('too many')
          ? 'Too many requests. Please wait a minute and try again.'
          : 'Could not send the reset email. Please try again.'
      );
      setSubmitting(false);
      return;
    }

    setSent(true);
    setSubmitting(false);
  };

  if (sent) {
    return (
      <div className="min-h-dvh bg-cream">
        <main className="mx-auto max-w-[420px] px-5 py-12">
          <h1 className="font-display text-[28px] leading-tight text-ink">
            Check your email
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            If an account exists for that email, we&apos;ve sent a link
            to reset your password. Open the email and tap the link to
            choose a new password.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            The link works for a limited time. If it doesn&apos;t
            arrive, check your spam folder or contact your clinic.
          </p>
          <Link
            href={`${prefix}/login`}
            className="mt-8 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft"
          >
            Back to sign in
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-cream">
      <main className="mx-auto max-w-[420px] px-5 py-12">
        <h1 className="font-display text-[28px] leading-tight text-ink">
          Reset your password
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          Enter the email your clinic has for you. We&apos;ll send a
          link to set a new password.
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
            disabled={submitting || !email}
            className="flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-soft"
          >
            {submitting ? 'Sending\u2026' : 'Send reset link'}
          </button>
        </form>

        <p className="mt-6 text-center text-[14px]">
          <Link
            href={`${prefix}/login`}
            className="font-semibold text-sage-deep hover:text-ink"
          >
            Back to sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
