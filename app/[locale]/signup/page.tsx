'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { useAuth } from '@/lib/supabase/auth';
import { professionOptions, type ProfessionCode } from '@/lib/professionLabel';
import { Wordmark } from '@/components/layout/Wordmark';

/**
 * Public self-registration for PATIENTS and THERAPISTS.
 *
 * Clinician is deliberately NOT an option here — clinician accounts are
 * created only by an admin. The role chosen here is passed as signup
 * metadata, but the database trigger (0058) is the real gate: it clamps
 * the role to patient/physiotherapist, so even a tampered request can
 * never self-create a clinician.
 *
 * On success: if the project issues a session immediately, the auth
 * listener redirects to the role home; otherwise (email confirmation
 * on) we show a "check your email" message.
 */
export default function SignupPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('signup');
  const { user, profile, loading } = useAuth();

  const [role, setRole] = useState<'patient' | 'physiotherapist'>('patient');
  const [name, setName] = useState('');
  const [profession, setProfession] = useState<ProfessionCode>(
    'physiotherapist'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const prefix = locale === 'en' ? '' : `/${locale}`;

  // If a session already exists (e.g. immediate sign-in after signup),
  // send them to their role home.
  useEffect(() => {
    if (loading || checkEmail) return;
    if (user && profile) {
      if (profile.mustChangePassword) {
        router.replace(`${prefix}/reset-password`);
        return;
      }
      let target = '/';
      if (profile.role === 'clinician') target = '/clinician';
      else if (profile.role === 'physiotherapist') target = '/physio';
      router.replace(
        locale === 'en' ? target : `/${locale}${target === '/' ? '' : target}`
      );
    }
  }, [loading, user, profile, router, locale, prefix, checkEmail]);

  const friendlyError = (raw: string): string => {
    const m = raw.toLowerCase();
    if (m.includes('already registered') || m.includes('already exists')) {
      return t('errAlreadyRegistered');
    }
    if (m.includes('password')) {
      return t('errPassword');
    }
    if (m.includes('email') && m.includes('invalid')) {
      return t('errEmail');
    }
    if (m.includes('rate limit') || m.includes('too many')) {
      return t('errRateLimit');
    }
    if (m.includes('network') || m.includes('fetch')) {
      return t('errNetwork');
    }
    return t('errGeneric');
  };

  const passwordValid = password.length >= 8;
  const nameValid = name.trim().length > 0;
  const canSubmit = nameValid && !!email && passwordValid && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const metadata: Record<string, string> = {
      display_name: name.trim(),
      signup_role: role
    };
    if (role === 'physiotherapist') {
      metadata.signup_profession = profession;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: metadata }
    });

    if (signUpError) {
      setError(friendlyError(signUpError.message));
      setSubmitting(false);
      return;
    }

    // If no session came back, the project requires email confirmation.
    if (!data.session) {
      setCheckEmail(true);
      setSubmitting(false);
      return;
    }
    // Otherwise the auth listener + effect above redirect to the role home.
  };

  if (checkEmail) {
    return (
      <div className="min-h-dvh bg-cream">
        <main className="mx-auto max-w-[420px] px-5 py-12">
          <Wordmark className="mb-8 block" />
          <h1 className="font-display text-[28px] leading-tight text-ink">
            {t('checkEmailTitle')}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            {t('checkEmailBody', { email: email.trim() })}
          </p>
          <p className="mt-6 text-center text-[14px]">
            <Link
              href={`${prefix}/login`}
              className="font-semibold text-sage-deep hover:text-ink"
            >
              {t('toLogin')}
            </Link>
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-cream">
      <main className="mx-auto max-w-[420px] px-5 py-12">
        <Wordmark className="mb-8 block" />
        <h1 className="font-display text-[28px] leading-tight text-ink">
          {t('title')}
        </h1>
        <p className="mt-2 text-[15px] text-ink-soft">{t('subtitle')}</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          {/* Role choice — patient or therapist only. */}
          <div>
            <span className="block text-[14px] font-semibold text-ink">
              {t('roleLabel')}
            </span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('patient')}
                aria-pressed={role === 'patient'}
                className={`flex h-11 items-center justify-center rounded-[var(--radius-button)] border text-[15px] font-semibold ${
                  role === 'patient'
                    ? 'border-sage-deep bg-sage-deep text-on-accent'
                    : 'border-stone bg-cream-soft text-ink hover:bg-stone-soft'
                }`}
              >
                {t('rolePatient')}
              </button>
              <button
                type="button"
                onClick={() => setRole('physiotherapist')}
                aria-pressed={role === 'physiotherapist'}
                className={`flex h-11 items-center justify-center rounded-[var(--radius-button)] border text-[15px] font-semibold ${
                  role === 'physiotherapist'
                    ? 'border-sage-deep bg-sage-deep text-on-accent'
                    : 'border-stone bg-cream-soft text-ink hover:bg-stone-soft'
                }`}
              >
                {t('roleTherapist')}
              </button>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
              {t('roleHint')}
            </p>
          </div>

          {/* Profession — therapist only. */}
          {role === 'physiotherapist' && (
            <div>
              <label
                htmlFor="profession"
                className="block text-[14px] font-semibold text-ink"
              >
                {t('professionLabel')}
              </label>
              <select
                id="profession"
                value={profession}
                onChange={(e) =>
                  setProfession(e.target.value as ProfessionCode)
                }
                className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[16px] text-ink focus:border-sage focus:outline-none"
              >
                {professionOptions(locale === 'da' ? 'da' : 'en').map(
                  (opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.label}
                    </option>
                  )
                )}
              </select>
            </div>
          )}

          <div>
            <label
              htmlFor="name"
              className="block text-[14px] font-semibold text-ink"
            >
              {t('nameLabel')}
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[16px] text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
            />
          </div>

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
              className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[16px] text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft py-2.5 pl-3 pr-20 text-[16px] text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-[14px] font-semibold text-sage-deep hover:text-ink"
              >
                {showPassword ? t('hide') : t('show')}
              </button>
            </div>
            <p className="mt-1.5 text-[13px] text-ink-muted">
              {t('passwordHint')}
            </p>
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
            disabled={!canSubmit}
            className="flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-soft"
          >
            {submitting ? t('creating') : t('createAction')}
          </button>
        </form>

        <p className="mt-6 text-center text-[14px] text-ink-soft">
          {t('haveAccount')}{' '}
          <Link
            href={`${prefix}/login`}
            className="font-semibold text-sage-deep hover:text-ink"
          >
            {t('toLogin')}
          </Link>
        </p>

        <p className="mt-4 text-center text-[13px]">
          <Link
            href={`${prefix}/privacy`}
            className="text-ink-muted hover:text-ink-soft"
          >
            {t('privacyLink')}
          </Link>
        </p>
      </main>
    </div>
  );
}
