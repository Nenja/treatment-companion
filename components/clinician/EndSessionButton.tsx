'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEndClinicianSession } from '@/lib/supabase/clinicianSession';
import { useToast } from '@/components/feedback/Toast';
import { useModalA11y } from '@/lib/useModalA11y';
import { markSessionEndingDeliberately } from '@/lib/sessionEndSignal';

/**
 * Shared "End session" control for clinician and therapist session
 * pages.
 *
 * Encapsulates the whole flow so any page can drop it into its header
 * without managing session-ending state itself:
 *   - a confirm dialog (ending mid-task — e.g. a half-filled treatment
 *     form — should never be one careless tap, so confirm is always on)
 *   - the deliberate-end signal (so the page's own session guard stands
 *     down instead of racing this navigation — see lib/sessionEndSignal)
 *   - navigation to the role's unlock screen with ?ended=1 (which the
 *     clinician unlock page reads to suppress the "timed out" message)
 *
 * Both roles share useEndClinicianSession (the therapist role uses the
 * same session machinery). Only the post-end destination differs.
 */
export function EndSessionButton({
  role
}: {
  role: 'clinician' | 'physiotherapist';
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('clinician.session');
  const endSession = useEndClinicianSession();
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const unlockBase =
    role === 'physiotherapist'
      ? locale === 'en'
        ? '/physio'
        : `/${locale}/physio`
      : locale === 'en'
        ? '/clinician'
        : `/${locale}/clinician`;

  const doEnd = async () => {
    // Signal a deliberate end BEFORE the mutation, so any page guard
    // watching for sessionQuery.data === null stands down rather than
    // firing its own competing navigation.
    markSessionEndingDeliberately();
    try {
      await endSession.mutateAsync();
    } catch {
      toast.error(t('endSessionError'));
      // Leave the flag set or not? Clear is safer: if the end failed,
      // the session is still live and guards should behave normally.
      // The signal module's worst case (a lingering flag) is harmless,
      // but we prefer correctness here.
      return;
    }
    router.replace(`${unlockBase}?ended=1`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        aria-label={t('endSession')}
        title={t('endSession')}
        className="flex h-11 w-11 items-center justify-center gap-1.5 rounded-full border border-stone bg-cream text-[13px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink sm:w-auto sm:rounded-[var(--radius-button)] sm:px-3"
      >
        {/* Exit-door glyph — the icon-only form on mobile. */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="shrink-0"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span className="hidden sm:inline">{t('endSession')}</span>
      </button>

      {confirmOpen && (
        <EndSessionConfirmDialog
          title={t('endSessionConfirm')}
          keepLabel={t('endSessionConfirmKeep')}
          endLabel={t('endSessionConfirmEnd')}
          onKeep={() => setConfirmOpen(false)}
          onEnd={doEnd}
        />
      )}
    </>
  );
}

function EndSessionConfirmDialog({
  title,
  keepLabel,
  endLabel,
  onKeep,
  onEnd
}: {
  title: string;
  keepLabel: string;
  endLabel: string;
  onKeep: () => void;
  onEnd: () => void;
}) {
  const containerRef = useModalA11y(onKeep);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-session-title"
        className="w-full max-w-[400px] rounded-[var(--radius-card)] border border-stone bg-cream p-6 shadow-xl"
      >
        <h2
          id="end-session-title"
          className="font-display text-[20px] leading-tight text-ink"
        >
          {title}
        </h2>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onKeep}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft"
          >
            {keepLabel}
          </button>
          <button
            type="button"
            onClick={onEnd}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {endLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
