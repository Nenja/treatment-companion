'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  useActiveVisitCode,
  useGenerateVisitCode
} from '@/lib/supabase/visitCode';
import { formatVisitCode } from '@/lib/visitCode';
import { AccountMenu } from '@/components/layout/AccountMenu';

/**
 * Patient's visit-code screen. Shows the current active code (if any)
 * with a countdown, or a button to generate one.
 *
 * The code persists server-side so multiple devices show the same code,
 * and so a reload doesn't generate a fresh one mid-visit.
 */
export default function VisitCodePage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('patient.visitCode');

  const { user, profile, loading: authLoading } = useAuth();
  const activeQuery = useActiveVisitCode(profile?.id ?? null, profile?.role);
  const generate = useGenerateVisitCode();

  // Auth gating.
  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) {
      router.replace(locale === 'en' ? '/login' : `/${locale}/login`);
      return;
    }
    if (profile.role !== 'patient') {
      router.replace(locale === 'en' ? '/' : `/${locale}`);
    }
  }, [authLoading, user, profile, router, locale]);

  // If no active code on initial load, generate one automatically.
  // We only auto-generate once per mount — if the patient lets it
  // expire on screen, they tap the "Generate a new code" button.
  const [didAutoGenerate, setDidAutoGenerate] = useState(false);
  useEffect(() => {
    if (
      !authLoading &&
      profile?.role === 'patient' &&
      !activeQuery.isLoading &&
      activeQuery.data === null &&
      !didAutoGenerate &&
      !generate.isPending
    ) {
      setDidAutoGenerate(true);
      generate.mutate();
    }
  }, [authLoading, profile, activeQuery, didAutoGenerate, generate]);

  // Tick once a second so the countdown updates.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const homePath = locale === 'en' ? '/' : `/${locale}`;
  const goHome = () => router.push(homePath);

  if (
    authLoading ||
    !user ||
    !profile ||
    profile.role !== 'patient' ||
    activeQuery.isLoading
  ) {
    return <div className="min-h-dvh bg-cream" />;
  }

  const code = activeQuery.data;
  const expiresAtMs = code ? new Date(code.expiresAt).getTime() : 0;
  const remainingMs = Math.max(0, expiresAtMs - nowMs);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const expired = code !== null && remainingMs === 0;

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className="mx-auto flex max-w-[480px] items-center justify-between px-5 py-4">
          <button
            type="button"
            onClick={goHome}
            className="text-[14px] font-semibold text-ink-soft hover:text-ink"
          >
            ← {t('back')}
          </button>
          <span className="eyebrow">{t('pageTitle')}</span>
          <AccountMenu />
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-5 py-10">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {t('intro')}
        </p>

        {code ? (
          <div className="mt-10 flex flex-col items-center">
            <div
              className={`font-mono text-[44px] font-bold tracking-[0.15em] tabular-nums ${
                expired ? 'text-ink-muted line-through' : 'text-ink'
              }`}
              aria-label={code.code.split('').join(' ')}
            >
              {formatVisitCode(code.code)}
            </div>

            {!expired ? (
              <p className="mt-4 text-[15px] text-ink-soft">
                {t('expiresIn', {
                  minutes: String(minutes),
                  seconds: String(seconds).padStart(2, '0')
                })}
              </p>
            ) : (
              <p className="mt-4 text-[15px] text-ink-soft">{t('expired')}</p>
            )}
          </div>
        ) : (
          <div className="mt-10 flex justify-center">
            <p className="text-[14px] text-ink-muted">
              {generate.isPending ? 'Generating…' : 'No active code'}
            </p>
          </div>
        )}

        {(expired || (!code && !generate.isPending)) && (
          <button
            type="button"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="mt-10 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-cream-soft hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone"
          >
            {t('regenerate')}
          </button>
        )}

        {generate.isError && (
          <p className="mt-3 text-[14px] text-amber-deep" role="alert">
            Could not generate a code. Please try again.
          </p>
        )}
      </main>
    </div>
  );
}
