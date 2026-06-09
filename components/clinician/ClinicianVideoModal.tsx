'use client';

import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';

/**
 * Per-patient video panel, opened from the cockpit toolbar (alongside
 * Training / History / Export). Holds the patient-level video governance that
 * used to clutter the Background card: the two consent checkmarks (recording
 * for clinical use / research) and an entry point to the archived-videos view.
 *
 * Per-goal video (protocol + that goal's baseline) lives elsewhere — on each
 * goal card's own "Video" button — because it is goal-scoped, not patient-
 * scoped. This panel is deliberately the home for the patient-wide pieces.
 */
export function ClinicianVideoModal({
  consentClinical,
  consentResearch,
  onSetConsent,
  onOpenArchive,
  onClose
}: {
  consentClinical: boolean;
  consentResearch: boolean;
  onSetConsent: (clinical: boolean, research: boolean) => void;
  onOpenArchive: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('clinician.videoPanel');
  const tPatient = useTranslations('clinician.patient');
  const tA11y = useTranslations('a11y');
  const containerRef = useModalA11y(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-[var(--max-w-page-narrow)] flex-col overflow-hidden rounded-[var(--radius-card)] border border-stone bg-cream-soft"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone/70 px-5 py-3">
          <span className="eyebrow">{t('title')}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={tA11y('close')}
            className="rounded-full p-1 text-ink-muted hover:bg-stone-soft hover:text-ink"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            {t('intro')}
          </p>

          {/* Consent — moved here from the Background card. */}
          <div className="mt-4 flex flex-col gap-2 rounded-[var(--radius-card)] border border-stone bg-cream p-3">
            <span className="text-[12px] font-semibold text-ink-soft">
              {tPatient('videoConsentTitle')}
            </span>
            <label className="flex items-start gap-2 text-[13px] text-ink-soft">
              <input
                type="checkbox"
                checked={consentClinical}
                onChange={(e) =>
                  onSetConsent(e.target.checked, consentResearch)
                }
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone text-sage-deep focus:ring-sage"
              />
              <span>{tPatient('videoConsentClinical')}</span>
            </label>
            <label className="flex items-start gap-2 text-[13px] text-ink-soft">
              <input
                type="checkbox"
                checked={consentResearch}
                onChange={(e) =>
                  onSetConsent(consentClinical, e.target.checked)
                }
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone text-sage-deep focus:ring-sage"
              />
              <span>{tPatient('videoConsentResearch')}</span>
            </label>
            <p className="text-[12px] leading-relaxed text-ink-muted">
              {t('consentHint')}
            </p>
          </div>

          {/* Archive entry. */}
          <button
            type="button"
            onClick={onOpenArchive}
            className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-sage-deep hover:bg-stone-soft"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" />
            </svg>
            {tPatient('archivedVideosButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
