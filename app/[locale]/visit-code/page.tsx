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

  // Re-check expiry periodically. We deliberately do NOT tick every
  // second — a live countdown on the patient's screen creates time
  // pressure at exactly the wrong moment (standing at the clinic while
  // a clinician types the code). A 15-second check is enough to flip
  // the "expired" / "expiring soon" states without a stopwatch.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(i);
  }, []);

  // "Copied" confirmation — reverts after a couple of seconds.
  const [copied, setCopied] = useState(false);

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
  const expired = code !== null && remainingMs === 0;
  // "Expiring soon" once under ~1 minute — a gentle nudge to regenerate
  // rather than a ticking number.
  const expiringSoon = !expired && remainingMs > 0 && remainingMs < 60_000;

  // Copy the PLAIN code (no display spacing) — whoever receives it
  // types the raw characters into the unlock screen. Uses the async
  // clipboard API; if it's unavailable or denied, we just don't show
  // the confirmation rather than erroring at the patient.
  const onCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard unavailable — patient can still read the code */
    }
  };

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

            {expired ? (
              <p className="mt-4 text-[15px] text-ink-soft">
                {t('expired')}
              </p>
            ) : expiringSoon ? (
              <p className="mt-4 text-[15px] text-amber-deep">
                {t('expiringSoon')}
              </p>
            ) : (
              <p className="mt-4 text-[15px] text-ink-soft">
                {t('validFor')}
              </p>
            )}

            {/* Copy button — only for a live code. Lets the patient
                send the code (e.g. a phone consultation) instead of
                transcribing it, and helps low-vision patients. */}
            {!expired && (
              <button
                type="button"
                onClick={onCopy}
                className="mt-6 flex h-11 items-center justify-center gap-2 rounded-[var(--radius-button)] border border-sage/50 bg-cream-soft px-6 text-[15px] font-semibold text-sage-deep hover:bg-sage-soft"
              >
                <span aria-hidden>{copied ? '✓' : '⧉'}</span>
                {copied ? t('copied') : t('copy')}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-10 flex justify-center">
            <p className="text-[14px] text-ink-muted">
              {generate.isPending ? 'Generating…' : 'No active code'}
            </p>
          </div>
        )}

        {(expired || expiringSoon || (!code && !generate.isPending)) && (
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
            Could not generate a code. Please try again. If it keeps
            happening, contact your clinic.
          </p>
        )}
      </main>
    </div>
  );
}
