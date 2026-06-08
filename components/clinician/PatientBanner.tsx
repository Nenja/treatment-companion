'use client';

interface PatientBannerProps {
  /** Formatted demographics line (age / sex / etiology / side / ambulation). */
  summary: string | null;
  modalityLabel: string;
}

/**
 * Slim one-line context for the patient under review: demographics + the
 * current modality. Kept deliberately light (no card chrome) so the
 * "since last visit" panel below it leads. The treatment date lives in that
 * panel's anchor, and medication/devices moved into its footer, so nothing
 * is duplicated here. Tapping the name in the page header still opens the
 * full patient-info route.
 */
export function PatientBanner({ summary, modalityLabel }: PatientBannerProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {summary && (
        <p className="min-w-0 text-[13px] leading-relaxed text-ink-soft">
          {summary}
        </p>
      )}
      <span className="inline-flex shrink-0 items-center rounded-full border border-stone bg-stone-soft px-2.5 py-1 text-[12px] font-semibold text-ink-soft">
        {modalityLabel}
      </span>
    </div>
  );
}
