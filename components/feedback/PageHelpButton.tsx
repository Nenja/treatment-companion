'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';

/**
 * Contextual page help.
 *
 * A small "?" button for a page's top panel. Tapping it opens a modal
 * explaining what that screen is and how to use it — short, scoped to
 * the one page, always available for reference in the moment (distinct
 * from the onboarding wizard, which is a one-time/linear overview).
 *
 * Content is centralised in the `help` translation namespace, keyed by
 * page: `help.{pageKey}Title` and `help.{pageKey}Body`. To add help to
 * a new page, add those two keys and drop <PageHelpButton pageKey="…">
 * into its header — no per-page modal code.
 *
 * The modal matches the app's existing dialog style (bottom sheet on
 * mobile, centred on larger screens) and uses useModalA11y for focus
 * trapping and Escape-to-close.
 */
export function PageHelpButton({ pageKey }: { pageKey: string }) {
  const t = useTranslations('help');
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('buttonLabel')}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stone bg-cream text-ink-soft hover:bg-stone-soft hover:text-ink"
      >
        {/* Question-mark glyph. aria-hidden — the button has a label. */}
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

      {open && (
        <HelpDialog
          title={t(`${pageKey}Title`)}
          body={t(`${pageKey}Body`)}
          closeLabel={t('close')}
          dialogLabel={t('dialogLabel')}
          onClose={() => setOpen(false)}
        />
      )}
    </>
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
  );
}
