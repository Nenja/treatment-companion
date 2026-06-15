'use client';

import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';

type ConsentTone = 'on' | 'warn' | 'off';

/** One consent line: label on its own row, then a status pill + action button
 *  aligned together so they never drift apart when the text wraps. */
function ConsentRow({
  label,
  tone,
  status,
  actionLabel,
  onAction
}: {
  label: string;
  tone: ConsentTone;
  status: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const pill =
    tone === 'on'
      ? 'border-sage-soft bg-sage-soft/40 text-sage-deep'
      : tone === 'warn'
        ? 'border-amber-soft bg-amber-soft/40 text-amber-deep'
        : 'border-stone bg-stone-soft text-ink-soft';
  return (
    <div>
      <span className="block text-[13px] text-ink-muted">{label}</span>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${pill}`}
        >
          {status}
        </span>
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-2.5 py-1 text-[12px] font-semibold text-sage-deep hover:bg-stone-soft"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * The patient-level **Consent** panel, opened from the cockpit toolbar
 * (labelled "Consent"). It is the single home for all three consent
 * dimensions — recording for clinical use, educational use of video, and
 * research participation — each shown as a status pill + grant/withdraw
 * action. It also holds the entry point to the archived-videos view.
 *
 * (The component keeps the name ClinicianVideoModal for import stability.
 * The consent rows that used to sit on the Background card now live only
 * here.) Per-goal video — protocol + that goal's baseline — stays on each
 * goal card's own "Video" button, because it is goal-scoped, not patient-
 * scoped.
 */
export function ClinicianVideoModal({
  consentClinical,
  consentEducational,
  onSetConsent,
  consentResearch,
  researchWithdrawn,
  onToggleResearch,
  onOpenArchive,
  onClose
}: {
  consentClinical: boolean;
  consentEducational: boolean;
  onSetConsent: (clinical: boolean, educational: boolean) => void;
  consentResearch: boolean;
  researchWithdrawn: boolean;
  onToggleResearch: () => void;
  onOpenArchive: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('clinician.videoPanel');
  const tPatient = useTranslations('clinician.patient');
  const tCC = useTranslations('clinicalConsent');
  const tEC = useTranslations('educationalConsent');
  const tRC = useTranslations('researchConsent');
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

          {/* All three consent dimensions live here — the single source. */}
          <div className="mt-4 flex flex-col gap-3 rounded-[var(--radius-card)] border border-stone bg-cream p-3">
            <ConsentRow
              label={tCC('heading')}
              tone={consentClinical ? 'on' : 'off'}
              status={consentClinical ? tCC('statusOn') : tCC('statusOff')}
              actionLabel={consentClinical ? tCC('withdraw') : tCC('grant')}
              onAction={() => onSetConsent(!consentClinical, consentEducational)}
            />
            <ConsentRow
              label={tEC('heading')}
              tone={consentEducational ? 'on' : 'off'}
              status={consentEducational ? tEC('statusOn') : tEC('statusOff')}
              actionLabel={consentEducational ? tEC('withdraw') : tEC('grant')}
              onAction={() => onSetConsent(consentClinical, !consentEducational)}
            />
            <ConsentRow
              label={tRC('heading')}
              tone={
                consentResearch ? 'on' : researchWithdrawn ? 'warn' : 'off'
              }
              status={
                consentResearch
                  ? tRC('statusConsented')
                  : researchWithdrawn
                    ? tRC('statusWithdrawn')
                    : tRC('statusNone')
              }
              actionLabel={consentResearch ? tRC('withdraw') : tRC('grant')}
              onAction={onToggleResearch}
            />
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
