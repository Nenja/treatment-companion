'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useStore, actions } from '@/lib/store';
import { normalizeVisitCodeInput } from '@/lib/visitCode';
import { useSessionTimeout } from '@/lib/useSessionTimeout';

/**
 * Clinician landing screen.
 *
 * If a session is already active and not timed out → redirect to the
 * patient view. Otherwise show the code-entry form.
 */
export default function ClinicianUnlockPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('clinician.unlock');
  const state = useStore();

  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // Run the inactivity timeout watcher — ends the session after 1 hour.
  useSessionTimeout({
    onTimeout: () => {
      actions.endClinicianSession();
      setTimedOut(true);
    }
  });

  // If a session is active, jump to the patient view.
  useEffect(() => {
    if (state.clinicianSession && !timedOut) {
      router.replace(
        locale === 'en'
          ? '/clinician/patient'
          : `/${locale}/clinician/patient`
      );
    }
  }, [state.clinicianSession, timedOut, router, locale]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const normalised = normalizeVisitCodeInput(input);
    if (normalised.length !== 6) {
      setError(t('errorInvalid'));
      return;
    }
    const patientId = actions.unlockWithVisitCode(normalised);
    if (!patientId) {
      setError(t('errorInvalid'));
      return;
    }
    router.replace(
      locale === 'en' ? '/clinician/patient' : `/${locale}/clinician/patient`
    );
  };

  const tSession = useTranslations('clinician.session');

  return (
    <div className="min-h-dvh bg-cream">
      <main className="mx-auto max-w-[480px] px-5 py-10">
        <h1 className="font-display text-[28px] leading-tight text-ink">
          {t('title')}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          {t('body')}
        </p>

        {timedOut && (
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
            className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-cream-soft hover:bg-ink-soft"
          >
            {t('submit')}
          </button>
        </form>
      </main>
    </div>
  );
}
