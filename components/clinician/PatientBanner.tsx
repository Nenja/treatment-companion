'use client';

interface PatientBannerProps {
  name: string;
  onOpenInfo: () => void;
  openInfoAria: string;
  /** Formatted demographics line (age / sex / etiology / side / ambulation). */
  summary: string | null;
  /** Prebuilt "treated on <date>" string. */
  treatmentDateText: string;
  modalityLabel: string;
  medication: string | null;
  devices: string | null;
  labels: { medication: string; devices: string };
}

/**
 * Always-visible background for the patient under review: identity +
 * demographics, current cycle/modality, current medication, and assistive
 * devices — surfaced on arrival so the clinician doesn't have to open the
 * info route or the medication panel to see the basics while planning.
 * Tapping the name still opens the full patient-info route.
 */
export function PatientBanner({
  name,
  onOpenInfo,
  openInfoAria,
  summary,
  treatmentDateText,
  modalityLabel,
  medication,
  devices,
  labels
}: PatientBannerProps) {
  return (
    <div className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onOpenInfo}
            aria-label={openInfoAria}
            className="group flex items-center gap-1.5 text-left"
          >
            <span className="font-display text-[22px] leading-tight text-ink group-hover:text-sage-deep">
              {name}
            </span>
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted group-hover:text-sage-deep"
              aria-hidden
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="11" x2="12" y2="16" />
                <circle cx="12" cy="8" r="0.6" fill="currentColor" />
              </svg>
            </span>
          </button>
          {summary && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">
              {summary}
            </p>
          )}
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <span className="inline-flex items-center rounded-full border border-stone bg-stone-soft px-2.5 py-1 text-[12px] font-semibold text-ink-soft">
            {modalityLabel}
          </span>
        </div>
      </div>

      <p className="mt-1 text-[13px] text-ink-muted">{treatmentDateText}</p>

      {(medication || devices) && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-stone pt-3">
          {medication && (
            <div className="flex gap-2 text-[13px]">
              <span className="shrink-0 font-semibold text-ink-soft">
                {labels.medication}
              </span>
              <span className="text-ink-soft">{medication}</span>
            </div>
          )}
          {devices && (
            <div className="flex gap-2 text-[13px]">
              <span className="shrink-0 font-semibold text-ink-soft">
                {labels.devices}
              </span>
              <span className="text-ink-soft">{devices}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
