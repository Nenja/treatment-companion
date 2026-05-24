'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  useCurrentClinicianSession,
  useUnlockWithCode
} from '@/lib/supabase/clinicianSession';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { IntroPanel } from '@/components/feedback/IntroPanel';
import { useToast } from '@/components/feedback/Toast';
import { classifyError } from '@/lib/feedback';

/**
 * Physiotherapist landing screen.
 *
 * Physiotherapists unlock a patient with the same visit-code mechanism
 * physicians use — a 1-hour session. (The clinician_session table and
 * unlock RPC are role-agnostic; a physiotherapist has a `clinician`
 * table row so current_clinician_id() works for them too.)
 *
 * If a session is already active → redirect to the physio patient view.
 * Otherwise show the code-entry form.
 *
 * Slice 1 (foundation): this page + a placeholder patient view. Progress
 * reporting, goal suggestions, and muscle suggestions come in later
 * slices.
 */
export default function PhysioUnlockPage() {
  const router = useRouter();
  const locale = useLocale();
  const { user, profile, loading: authLoading } = useAuth();
  const sessionQuery = useCurrentClinicianSession(
    profile?.id ?? null,
    profile?.role
  );
  const unlock = useUnlockWithCode();
  const toast = useToast();

  const [input, setInput] = useState('');

  const patientPath =
    locale === 'en' ? '/physio/patient' : `/${locale}/physio/patient`;

  // Auth gating — physiotherapists only.
  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) {
      router.replace(locale === 'en' ? '/login' : `/${locale}/login`);
      return;
    }
    if (profile.role !== 'physiotherapist') {
      router.replace(locale === 'en' ? '/' : `/${locale}`);
    }
  }, [authLoading, user, profile, router, locale]);

  // If a valid session exists, jump straight to the patient view.
  useEffect(() => {
    if (sessionQuery.data) {
      router.replace(patientPath);
    }
  }, [sessionQuery.data, router, patientPath]);

  if (
    authLoading ||
    !profile ||
    profile.role !== 'physiotherapist' ||
    sessionQuery.isLoading
  ) {
    return <div className="min-h-dvh bg-cream" />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (unlock.isPending) return;
    try {
      await unlock.mutateAsync(input);
      router.replace(patientPath);
    } catch (err) {
      toast.error(tFeedbackMessage(err));
    }
  };

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className="mx-auto flex max-w-[480px] items-center justify-between px-5 py-4">
          <span className="eyebrow">Physiotherapist</span>
          <AccountMenu />
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-5 pb-16 pt-10">
        <IntroPanel role="physiotherapist" />
        <h1 className="font-display text-[26px] leading-tight text-ink">
          Unlock a patient
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          Ask the patient to open their app and read you the 6-character
          visit code. Entering it gives you access for one hour.
        </p>

        <form onSubmit={onSubmit} className="mt-8">
          <label
            htmlFor="visit-code"
            className="block text-[14px] font-semibold text-ink"
          >
            Visit code
          </label>
          <input
            id="visit-code"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="ABC-DEF"
            maxLength={7}
            className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-4 text-center font-mono text-[26px] font-bold tracking-[0.15em] text-ink placeholder:text-ink-muted/50 focus:border-sage focus:outline-none"
          />

          <button
            type="submit"
            disabled={unlock.isPending}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone"
          >
            {unlock.isPending ? '…' : 'Unlock'}
          </button>
        </form>
      </main>
    </div>
  );
}

/**
 * Maps an unlock error to a readable message. The visit-code RPC
 * raises specific exceptions for an invalid/expired code; classifyError
 * handles the generic cases, and we special-case the not-found message.
 */
function tFeedbackMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  if (/code|not found|invalid|expired/.test(msg)) {
    return 'That visit code is not valid or has expired. Ask the patient for a fresh code.';
  }
  // Fall back to the generic classifier keys (English copy here since
  // the physio area is not yet fully localised).
  const key = classifyError(err);
  if (key === 'errorNetwork') {
    return 'Network problem. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}
