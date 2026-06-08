'use client';

interface PatientBannerProps {
  /** Formatted demographics line (age / sex / etiology / side / ambulation). */
  summary: string | null;
  /** Prebuilt "treated on <date>" string. */
  treatmentDateText: string;
  modalityLabel: string;
  medication: string | null;
  devices: string | null;
  /** Opens the medication editor (the name now lives only in the page header,
   *  and medication is edited from here rather than the action row). */
  onEditMedication: () => void;
  labels: {
    medication: string;
    devices: string;
    edit: string;
    medicationNone: string;
  };
}

/**
 * Always-visible background for the patient under review: identity +
 * demographics, current cycle/modality, current medication, and assistive
 * devices — surfaced on arrival so the clinician doesn't have to open the
 * info route or the medication panel to see the basics while planning.
 * Tapping the name still opens the full patient-info route.
 */
export function PatientBanner({
  summary,
  treatmentDateText,
  modalityLabel,
  medication,
  devices,
  onEditMedication,
  labels
}: PatientBannerProps) {
  return (
    <div className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        {summary && (
          <p className="min-w-0 text-[13px] leading-relaxed text-ink-soft">
            {summary}
          </p>
        )}
        <span className="inline-flex shrink-0 items-center rounded-full border border-stone bg-stone-soft px-2.5 py-1 text-[12px] font-semibold text-ink-soft">
          {modalityLabel}
        </span>
      </div>

      <p className="mt-1 text-[13px] text-ink-muted">{treatmentDateText}</p>

      <div className="mt-3 flex flex-col gap-1.5 border-t border-stone pt-3">
        <div className="flex items-start justify-between gap-2 text-[13px]">
          <span className="min-w-0">
            <span className="font-semibold text-ink-soft">
              {labels.medication}
            </span>{' '}
            {medication ? (
              <span className="text-ink-soft">{medication}</span>
            ) : (
              <span className="text-ink-muted">{labels.medicationNone}</span>
            )}
          </span>
          <button
            type="button"
            onClick={onEditMedication}
            className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-2.5 py-1 text-[12px] font-semibold text-sage-deep hover:bg-stone-soft"
          >
            {labels.edit}
          </button>
        </div>
        {devices && (
          <div className="flex gap-2 text-[13px]">
            <span className="shrink-0 font-semibold text-ink-soft">
              {labels.devices}
            </span>
            <span className="text-ink-soft">{devices}</span>
          </div>
        )}
      </div>
    </div>
  );
}
