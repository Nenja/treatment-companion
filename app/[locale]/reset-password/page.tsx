'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { useAuth } from '@/lib/supabase/auth';

/**
 * Set-password screen. Serves two flows:
 *
 *  1. Password reset — the person clicked the link in a reset email.
 *     Supabase consumes the recovery token in the URL and puts them in
 *     a temporary recovery session. They set a new password here.
 *
 *  2. Forced first-login change — an admin-created account is still on
 *     its clinic-issued temp password (profile.must_change_password).
 *     The app routes them here; they replace it with their own.
 *
 * Both flows end identically: supabase.auth.updateUser sets the new
 * password, and we clear must_change_password. The only difference is
 * the heading copy, so the person understands why they're here.
 *
 * Guard: if someone reaches this page with neither a recovery session
 * nor a logged-in account, there's nothing to set — we send them to
 * sign in.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('resetPassword');
  const prefix = locale === 'en' ? '' : `/${locale}`;
  const { user, profile, loading, refreshProfile } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // No session at all (not a recovery session, not logged in) → nothing
  // to do here. Wait for auth to resolve, then bounce to sign in.
  useEffect(() => {
    if (loading) return;
    if (!user && !done) {
      router.replace(`${prefix}/login`);
    }
  }, [loading, user, done, router, prefix]);

  // Is this the forced-change flow? (logged in + flag set)
  const forcedChange = !!profile?.mustChangePassword;

  const validate = (): string | null => {
    if (password.length < 8) {
      return t('errTooShort');
    }
    if (password !== confirm) {
      return t('errMismatch');
    }
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password
    });
    if (updateError) {
      const m = updateError.message.toLowerCase();
      setError(
        m.includes('same') || m.includes('different')
          ? t('errSameAsCurrent')
          : m.includes('weak') || m.includes('short')
            ? t('errWeak')
            : t('errGeneric')
      );
      setSubmitting(false);
      return;
    }

    // Clear the forced-change flag if it was set. Self-update on the
    // own profile row is allowed by RLS.
    if (user) {
      await supabase
        .from('profile')
        .update({ must_change_password: false })
        .eq('id', user.id);
      // Re-read the profile into auth state so PasswordChangeGuard sees
      // must_change_password is now false — otherwise tapping Continue
      // navigates home and the guard immediately bounces back here.
      await refreshProfile();
    }

    setDone(true);
    setSubmitting(false);
  };

  if (done) {
    return (
      <div className="min-h-dvh bg-cream">
        <main className="mx-auto max-w-[420px] px-5 py-12">
          <h1 className="font-display text-[28px] leading-tight text-ink">
            Password updated
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            Your new password is saved. Use it next time you sign in.
          </p>
          <button
            type="button"
            onClick={() => router.replace(prefix || '/')}
            className="mt-8 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft"
          >
            Continue
          </button>
        </main>
      </div>
    );
  }

  // While auth is resolving, render nothing — avoids a flash of the
  // form before we know whether to bounce to login.
  if (loading || !user) {
    return <div className="min-h-dvh bg-cream" />;
  }

  return (
    <div className="min-h-dvh bg-cream">
      <main className="mx-auto max-w-[420px] px-5 py-12">
        <h1 className="font-display text-[28px] leading-tight text-ink">
          {forcedChange ? t('titleForced') : t('titleNormal')}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          {forcedChange
            ? t('introForced')
            : t('introNormal')}
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
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
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft py-2.5 pl-3 pr-20 text-[16px] text-ink focus:border-sage focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-pressed={show}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-[14px] font-semibold text-sage-deep hover:text-ink"
              >
                {show ? t('hide') : t('show')}
              </button>
            </div>
            <p className="mt-1 text-[13px] text-ink-muted">
              At least 8 characters.
            </p>
          </div>

          <div>
            <label
              htmlFor="confirm"
              className="block text-[14px] font-semibold text-ink"
            >
              {t('confirmLabel')}
            </label>
            <input
              id="confirm"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[16px] text-ink focus:border-sage focus:outline-none"
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
            disabled={submitting || !password || !confirm}
            className="flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-soft"
          >
            {submitting ? t('submitting') : t('submit')}
          </button>
        </form>
      </main>
    </div>
  );
}
