'use client';

import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';

/**
 * Guided follow-up shown right after a clinician flips video ON for a goal
 * (fired by VideoProtocolEditor's onEnabled). It walks the two steps that have
 * to happen before a recording exists, in order:
 *
 *   1. Consent — recording for clinical use is required before any video can
 *      be filmed (the recorders enforce this server-side too). The two
 *      checkmarks here write the same patient-level flags as the toolbar Video
 *      panel.
 *   2. Baseline — once clinical consent is on file, offer to film the baseline
 *      straight away; otherwise the film action stays disabled with a hint.
 *
 * Nothing here is mandatory: "Do this later" closes the guide and leaves the
 * goal enabled with no recording, which is a legitimate state.
 */
export function VideoEnableGuide({
  goalText,
  consentClinical,
  consentResearch,
  hasBaseline,
  onSetConsent,
  onFilmBaseline,
  onClose
}: {
  goalText: string;
  consentClinical: boolean;
  consentResearch: boolean;
  hasBaseline: boolean;
  onSetConsent: (clinical: boolean, research: boolean) => void;
  onFilmBaseline: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('clinician.videoGuide');
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
            {t('intro', { goal: goalText })}
          </p>

          {/* Step 1 — consent */}
          <div className="mt-4 rounded-[var(--radius-card)] border border-stone bg-cream p-3">
            <span className="text-[12px] font-semibold text-ink-soft">
              {t('step1')}
            </span>
            <label className="mt-2 flex items-start gap-2 text-[13px] text-ink-soft">
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
            <label className="mt-2 flex items-start gap-2 text-[13px] text-ink-soft">
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
            {!consentClinical && (
              <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
                {t('consentHint')}
              </p>
            )}
          </div>

          {/* Step 2 — baseline */}
          <div className="mt-3 rounded-[var(--radius-card)] border border-stone bg-cream p-3">
            <span className="text-[12px] font-semibold text-ink-soft">
              {t('step2')}
            </span>
            {hasBaseline && (
              <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                {t('haveBaseline')}
              </p>
            )}
            <button
              type="button"
              disabled={!consentClinical}
              onClick={onFilmBaseline}
              className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-sage-deep px-3 py-1.5 text-[13px] font-semibold text-on-accent hover:bg-sage disabled:cursor-not-allowed disabled:opacity-50"
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
                <rect x="2" y="6" width="14" height="12" rx="2" />
                <path d="M16 10l6-3v10l-6-3z" />
              </svg>
              {hasBaseline ? t('refilm') : t('film')}
            </button>
            {!consentClinical && (
              <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
                {t('filmGatedHint')}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-4 text-[13px] font-semibold text-ink-muted hover:text-ink"
          >
            {t('later')}
          </button>
        </div>
      </div>
    </div>
  );
}
