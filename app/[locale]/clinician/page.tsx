'use client';

import { useEffect, useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  useUnlockWithCode,
  useMySessions,
  useSwitchSession,
  useReopenSession
} from '@/lib/supabase/clinicianSession';
import { OnboardingWizard } from '@/components/feedback/OnboardingWizard';
import { clearSessionEndingFlag } from '@/lib/sessionEndSignal';

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
  const unlock = useUnlockWithCode();
  const mySessions = useMySessions(profile?.id ?? null, profile?.role);
  const switchSession = useSwitchSession();
  const reopenSession = useReopenSession();

  const patientPath =
    locale === 'en' ? '/clinician/patient' : `/${locale}/clinician/patient`;

  const openToPatient = async (
    patientId: string,
    mode: 'switch' | 'reopen'
  ) => {
    try {
      if (mode === 'switch') await switchSession.mutateAsync(patientId);
      else await reopenSession.mutateAsync(patientId);
      router.replace(patientPath);
    } catch {
      // Stale (e.g. the day rolled over) — fall back to needing a code.
      mySessions.refetch();
    }
  };

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

  // Detect the timed-out case: we landed here without a session and the
  // query string says "timeout=1" (set by a clinician page when a
  // session expired). A deliberate end instead carries "ended=1" — when
  // that is present we must NOT show the timeout message, even if a
  // stray timeout redirect also raced here. The deliberate marker wins.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const deliberateEnd = params.get('ended') === '1';
      if (params.get('timeout') === '1' && !deliberateEnd) {
        setShowTimedOut(true);
      }
    }
    // The session-end navigation has completed (we're on the unlock
    // screen now), so clear the deliberate-end signal that sub-page
    // guards checked. Safe to call unconditionally.
    clearSessionEndingFlag();
  }, []);

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
      <AppHeader width="narrow" />
      <main className="mx-auto max-w-[480px] px-5 py-10">
        <OnboardingWizard role="clinician" replayOnly />
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

        {(() => {
          const sessions = mySessions.data ?? [];
          const open = sessions.filter((s) => s.isActive);
          const reopen = sessions.filter((s) => !s.isActive);
          if (open.length === 0 && reopen.length === 0) return null;
          const Row = ({
            s,
            mode
          }: {
            s: { patientId: string; displayName: string };
            mode: 'switch' | 'reopen';
          }) => (
            <button
              key={s.patientId}
              type="button"
              onClick={() => openToPatient(s.patientId, mode)}
              className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-3 text-left hover:bg-stone-soft"
            >
              <span className="truncate text-[15px] font-semibold text-ink">
                {s.displayName}
              </span>
              <span className="shrink-0 text-[13px] font-semibold text-sage-deep">
                {mode === 'switch' ? tSession('open') : tSession('reopen')}
              </span>
            </button>
          );
          return (
            <div className="mt-8 flex flex-col gap-4">
              {open.length > 0 && (
                <div>
                  <p className="text-[14px] font-semibold text-ink">
                    {tSession('openHeading')}
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-soft">
                    {tSession('openHint')}
                  </p>
                  <div className="mt-2 flex flex-col gap-2">
                    {open.map((s) => (
                      <Row key={s.patientId} s={s} mode="switch" />
                    ))}
                  </div>
                </div>
              )}
              {reopen.length > 0 && (
                <div>
                  <p className="text-[14px] font-semibold text-ink">
                    {tSession('reopenHeading')}
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-soft">
                    {tSession('reopenHint')}
                  </p>
                  <div className="mt-2 flex flex-col gap-2">
                    {reopen.map((s) => (
                      <Row key={s.patientId} s={s} mode="reopen" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        <form onSubmit={onSubmit} className="mt-8">
          <label
            htmlFor="visitCode"
            className="block text-[14px] font-semibold text-ink"
          >
            {t('codeLabel')}
          </label>
          <input
            id="visitCode"
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            placeholder="ABC-DEF"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-4 text-center font-mono text-[26px] font-bold tracking-[0.15em] text-ink placeholder:text-ink-muted/50 focus:border-sage focus:outline-none"
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
            className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone"
          >
            {unlock.isPending ? '…' : t('submit')}
          </button>
        </form>

        {profile?.isAdmin && (
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
              {t('adminLink')}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
