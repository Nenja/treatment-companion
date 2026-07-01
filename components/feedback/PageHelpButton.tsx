'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useModalA11y } from '@/lib/useModalA11y';
import { ModalPortal } from '@/components/feedback/ModalPortal';
import { GuidedTour } from '@/components/feedback/GuidedTour';
import { tourFor } from '@/lib/tourSteps';

/**
 * Always-present help control.
 *
 * Rendered in the header on every authed screen (pageKey optional). It's a
 * labelled "? Help" button — deliberately not icon-only and not a floating
 * bubble — so the way to get help sits in the same predictable spot for a
 * population that includes low-vision and motor-impaired patients.
 *
 * Tapping it opens ONE sheet that unifies the two help needs:
 *   - "explain this screen" — the page's guided tour (if one is registered
 *     in lib/tourSteps) or its short help text (help.{pageKey}Title/Body);
 *   - "reach a human" — a Contact support action that always appears and
 *     routes to /support (email inbox + emergency notice + GDPR route).
 *
 * Tour pages also get a one-time, dismissible first-visit nudge. "Seen" is
 * per-page in localStorage (a low-stakes per-device hint, not account state).
 */
export function PageHelpButton({ pageKey }: { pageKey?: string }) {
  const t = useTranslations('help');
  const tTour = useTranslations('tour');
  const locale = useLocale();
  const supportHref = locale === 'en' ? '/support' : `/${locale}/support`;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [showNudge, setShowNudge] = useState(false);

  const registered = pageKey ? tourFor(pageKey) : [];
  const hasTour = registered.length > 0;
  // Mirror the prior invariant: a provided non-tour pageKey has help text.
  const hasText = !!pageKey && !hasTour;
  const seenKey = pageKey ? `tc.tourNudge.${pageKey}` : '';

  const tourSteps = hasTour
    ? registered.map((s) => ({
        target: s.target,
        title: tTour(`${pageKey}.${s.key}Title`),
        body: tTour(`${pageKey}.${s.key}Body`)
      }))
    : [];

  const markSeen = () => {
    if (!seenKey) return;
    try {
      window.localStorage.setItem(seenKey, '1');
    } catch {
      /* private mode / storage disabled — fine, just nudge again later */
    }
  };

  // First-visit nudge: only for tour pages, only if not seen, after a beat.
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

  const openSheet = () => {
    if (hasTour) markSeen();
    setShowNudge(false);
    setSheetOpen(true);
  };
  const startTour = () => {
    markSeen();
    setShowNudge(false);
    setSheetOpen(false);
    setTourOpen(true);
  };
  const dismissNudge = () => {
    markSeen();
    setShowNudge(false);
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={openSheet}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-stone bg-cream pl-2.5 pr-3.5 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink"
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
        {t('buttonLabel')}
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
              onClick={startTour}
              className="rounded-[var(--radius-button)] bg-sage-deep px-3 py-1.5 text-[12px] font-semibold text-on-accent hover:bg-ink-soft"
            >
              {t('tourNudgeStart')}
            </button>
          </div>
        </div>
      )}

      {sheetOpen && (
        <HelpSheet
          title={t('sheetTitle')}
          heading={hasText ? t(`${pageKey}Title`) : null}
          body={hasText ? t(`${pageKey}Body`) : null}
          tourLabel={hasTour ? t('takeTour') : null}
          onStartTour={hasTour ? startTour : undefined}
          contactHint={t('contactHint')}
          contactLabel={t('contactSupport')}
          supportHref={supportHref}
          closeLabel={t('close')}
          dialogLabel={t('dialogLabel')}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {tourOpen && hasTour && (
        <GuidedTour steps={tourSteps} onClose={() => setTourOpen(false)} />
      )}
    </span>
  );
}

function HelpSheet({
  title,
  heading,
  body,
  tourLabel,
  onStartTour,
  contactHint,
  contactLabel,
  supportHref,
  closeLabel,
  dialogLabel,
  onClose
}: {
  title: string;
  heading: string | null;
  body: string | null;
  tourLabel: string | null;
  onStartTour?: () => void;
  contactHint: string;
  contactLabel: string;
  supportHref: string;
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

          {heading && (
            <div className="mt-4">
              <h3 className="text-[15px] font-semibold text-ink">{heading}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
                {body}
              </p>
            </div>
          )}

          {onStartTour && tourLabel && (
            <button
              type="button"
              onClick={onStartTour}
              className="mt-4 flex w-full items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-2.5 text-[15px] font-semibold text-ink hover:bg-stone-soft"
            >
              {tourLabel}
            </button>
          )}

          <div className="mt-5 border-t border-stone/60 pt-4">
            <p className="text-[14px] leading-relaxed text-ink-soft">
              {contactHint}
            </p>
            <Link
              href={supportHref}
              onClick={onClose}
              className="mt-3 flex h-11 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[15px] font-semibold text-on-accent hover:bg-ink-soft"
            >
              {contactLabel}
            </Link>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full rounded-[var(--radius-button)] px-4 py-2 text-[14px] font-semibold text-ink-muted hover:text-ink"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
