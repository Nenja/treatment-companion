'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useStore, actions } from '@/lib/store';
import { formatVisitCode } from '@/lib/visitCode';

/**
 * Patient view of their current visit code.
 *
 * - Generates a code on first mount (or reuses the most recent unconsumed
 *   one).
 * - Counts down the remaining validity in mm:ss.
 * - On expiry, offers a button to generate a new one.
 *
 * No PII is on this page. Just the code, a brief explanation, the timer,
 * and a way back home.
 */
export default function VisitCodePage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('patient.visitCode');
  const state = useStore();

  const patient = state.patients.find((p) => p.id === state.currentPatientId);

  // Pick the most recent unconsumed-and-unexpired code for this patient.
  const existing = patient
    ? state.visitCodes
        .filter(
          (c) =>
            c.patientId === patient.id &&
            !c.consumedAt &&
            new Date(c.expiresAt).getTime() > Date.now()
        )
        .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))[0]
    : undefined;

  const [code, setCode] = useState(existing);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Generate one if none exists.
  useEffect(() => {
    if (!patient) return;
    if (!code) {
      const fresh = actions.generateVisitCode(patient.id);
      setCode(fresh);
    }
  }, [patient, code]);

  // Tick every second to update the countdown.
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const homePath = locale === 'en' ? '/' : `/${locale}`;
  const goHome = () => router.push(homePath);

  if (!patient || !code) return null;

  const expiresAtMs = new Date(code.expiresAt).getTime();
  const remainingMs = Math.max(0, expiresAtMs - nowMs);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const expired = remainingMs === 0;

  const regenerate = () => {
    const fresh = actions.generateVisitCode(patient.id);
    setCode(fresh);
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
          <span className="w-10" aria-hidden />
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-5 py-10">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {t('intro')}
        </p>

        {/* The code itself — large, monospaced, generous spacing */}
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

        {expired && (
          <button
            type="button"
            onClick={regenerate}
            className="mt-10 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-cream-soft hover:bg-ink-soft"
          >
            {t('regenerate')}
          </button>
        )}
      </main>
    </div>
  );
}
