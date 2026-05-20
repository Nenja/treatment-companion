'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  useCurrentClinicianSession,
  useUnlockWithCode
} from '@/lib/supabase/clinicianSession';
import { AccountMenu } from '@/components/layout/AccountMenu';

/**
 * Clinician landing screen.
 *
 * If a session is already active → redirect to the patient view.
 * Otherwise show the code-entry form.
 */
export default function ClinicianUnlockPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('clinician.unlock');
  const tSession = useTranslations('clinician.session');

  const { user, profile, loading: authLoading } = useAuth();
  const sessionQuery = useCurrentClinicianSession(
    profile?.id ?? null,
    profile?.role
  );
  const unlock = useUnlockWithCode();

  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showTimedOut, setShowTimedOut] = useState(false);

  // Auth gating.
  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) {
      router.replace(locale === 'en' ? '/login' : `/${locale}/login`);
      return;
    }
    if (profile.role !== 'clinician') {
      router.replace(locale === 'en' ? '/' : `/${locale}`);
    }
  }, [authLoading, user, profile, router, locale]);

  // Detect the timed-out case: we landed here without a session but the
  // location's query string says "timeout=1" (set by patient-page on
  // session expiry). Just a UX hint, not a security boundary.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('timeout') === '1') setShowTimedOut(true);
    }
  }, []);

  // If a valid session exists, jump to the patient view.
  useEffect(() => {
    if (sessionQuery.data) {
      router.replace(
        locale === 'en'
          ? '/clinician/patient'
          : `/${locale}/clinician/patient`
      );
    }
  }, [sessionQuery.data, router, locale]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await unlock.mutateAsync(input);
      router.replace(
        locale === 'en' ? '/clinician/patient' : `/${locale}/clinician/patient`
      );
    } catch (err) {
      const msg =
        err instanceof Error && err.message ? err.message : t('errorInvalid');
      // The RPC raises "invalid or expired code" for bad codes — show
      // a friendly translated message rather than the raw text.
      if (/invalid|expired|6 characters/i.test(msg)) {
        setError(t('errorInvalid'));
      } else {
        setError(msg);
      }
    }
  };

  if (authLoading || !user || !profile || profile.role !== 'clinician') {
    return <div className="min-h-dvh bg-cream" />;
  }

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className="mx-auto flex max-w-[480px] items-center justify-end px-5 py-3">
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto max-w-[480px] px-5 py-10">
        <h1 className="font-display text-[28px] leading-tight text-ink">
          {t('title')}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          {t('body')}
        </p>

        {showTimedOut && (
          <div className="mt-6 rounded-[var(--radius-card)] border border-amber-soft bg-amber-soft/40 p-4">
            <p className="text-[14px] font-semibold text-ink">
              {tSession('timeoutTitle')}
            </p>
            <p className="mt-1 text-[14px] text-ink-soft">
              {tSession('timeoutBody')}
            </p>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-8">
          <label htmlFor="visitCode" className="sr-only">
            {t('title')}
          </label>
          <input
            id="visitCode"
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            placeholder={t('placeholder')}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-4 text-center font-mono text-[28px] font-bold tracking-[0.15em] text-ink placeholder:text-ink-muted/50 focus:border-sage focus:outline-none"
            maxLength={7}
          />
          {error && (
            <p className="mt-3 text-[14px] text-amber-deep" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={unlock.isPending}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-cream-soft hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone"
          >
            {unlock.isPending ? '…' : t('submit')}
          </button>
        </form>

        <div className="mt-8 border-t border-stone/70 pt-6">
          <button
            type="button"
            onClick={() =>
              router.push(
                locale === 'en'
                  ? '/clinician/admin'
                  : `/${locale}/clinician/admin`
              )
            }
            className="flex h-11 w-full items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            Admin: create or list accounts
          </button>
        </div>
      </main>
    </div>
  );
}
