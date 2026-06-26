'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';
import { ModalPortal } from '@/components/feedback/ModalPortal';
import { GuidedTour } from '@/components/feedback/GuidedTour';
import { tourFor } from '@/lib/tourSteps';

/**
 * Contextual page help.
 *
 * A small "?" button for a page's top panel. If the page has a tour
 * registered in `lib/tourSteps` (by pageKey), tapping "?" launches a
 * guided spotlight walkthrough; otherwise it opens a short text modal
 * scoped to the page (`help.{pageKey}Title` / `…Body`).
 *
 * Tour pages also get a one-time, dismissible "take a tour" nudge near
 * the button on first visit. "Seen" is remembered per page in
 * localStorage (a low-stakes, per-device hint — not account state), so
 * it won't nag again after the user starts or dismisses it.
 */
export function PageHelpButton({ pageKey }: { pageKey: string }) {
  const t = useTranslations('help');
  const tTour = useTranslations('tour');
  const [open, setOpen] = useState(false);
  const [showNudge, setShowNudge] = useState(false);

  const registered = tourFor(pageKey);
  const hasTour = registered.length > 0;
  const seenKey = `tc.tourNudge.${pageKey}`;

  const tourSteps = hasTour
    ? registered.map((s) => ({
        target: s.target,
        title: tTour(`${pageKey}.${s.key}Title`),
        body: tTour(`${pageKey}.${s.key}Body`)
      }))
    : [];

  const markSeen = () => {
    try {
      window.localStorage.setItem(seenKey, '1');
    } catch {
      /* private mode / storage disabled — fine, just nudge again later */
    }
  };

  // First-visit nudge: only for tour pages, only if not seen, and after a
  // short beat so it feels gentle rather than popping in on load.
  useEffect(() => {
    if (!hasTour) return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(seenKey) === '1';
    } catch {
      seen = false;
    }
    if (seen) return;
    const id = window.setTimeout(() => setShowNudge(true), 800);
    return () => window.clearTimeout(id);
  }, [hasTour, seenKey]);

  const launchTour = () => {
    markSeen();
    setShowNudge(false);
    setOpen(true);
  };
  const dismissNudge = () => {
    markSeen();
    setShowNudge(false);
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => {
          if (hasTour) markSeen();
          setShowNudge(false);
          setOpen(true);
        }}
        aria-label={t('buttonLabel')}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stone bg-cream text-ink-soft hover:bg-stone-soft hover:text-ink"
      >
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
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12" y2="17" />
        </svg>
      </button>

      {showNudge && (
        <div
          role="status"
          aria-live="polite"
          className="absolute right-0 top-full z-40 mt-2 w-60 rounded-[var(--radius-card)] border border-stone bg-cream p-3 shadow-lg"
        >
          <p className="text-[13px] leading-snug text-ink">{t('tourNudge')}</p>
          <div className="mt-2.5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={dismissNudge}
              className="text-[12px] font-semibold text-ink-muted hover:text-ink"
            >
              {t('tourNudgeDismiss')}
            </button>
            <button
              type="button"
              onClick={launchTour}
              className="rounded-[var(--radius-button)] bg-sage-deep px-3 py-1.5 text-[12px] font-semibold text-on-accent hover:bg-ink-soft"
            >
              {t('tourNudgeStart')}
            </button>
          </div>
        </div>
      )}

      {open && hasTour && (
        <GuidedTour steps={tourSteps} onClose={() => setOpen(false)} />
      )}

      {open && !hasTour && (
        <HelpDialog
          title={t(`${pageKey}Title`)}
          body={t(`${pageKey}Body`)}
          closeLabel={t('close')}
          dialogLabel={t('dialogLabel')}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

function HelpDialog({
  title,
  body,
  closeLabel,
  dialogLabel,
  onClose
}: {
  title: string;
  body: string;
  closeLabel: string;
  dialogLabel: string;
  onClose: () => void;
}) {
  const containerRef = useModalA11y(onClose);
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label={dialogLabel}
          className="max-h-[80vh] w-full max-w-[440px] overflow-y-auto rounded-[var(--radius-card)] border border-stone bg-cream p-6 shadow-xl"
        >
          <h2 className="font-display text-[20px] leading-tight text-ink">
            {title}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            {body}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
