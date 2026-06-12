'use client';

interface BackgroundCardProps {
  /** Demographics line (age / diagnosis / side / ambulation), if known. */
  summary: string | null;
  /** Current treatment modality, e.g. "Botulinum toxin". */
  treatmentTypeLabel: string;
  medication?: string | null;
  devices?: string | null;
  onEditMedication?: () => void;
  /** General research consent (migration 0098). Undefined hides the row. */
  researchConsent?: boolean;
  researchWithdrawn?: boolean;
  onToggleResearchConsent?: () => void;
  labels: {
    title: string;
    treatment: string;
    medication: string;
    devices: string;
    edit: string;
    medicationNone: string;
    research: string;
    researchOn: string;
    researchOff: string;
    researchWithdrawn: string;
    researchGrant: string;
    researchWithdrawAction: string;
  };
}

/**
 * Static patient background for the cockpit's context column: demographics,
 * treatment type and current medication, gathered into one card below the
 * "since last visit" panel. Consolidated here so this reference info has a
 * single home rather than being split across the page header, a floating pill
 * and the visit-card footer.
 */
export function BackgroundCard({
  summary,
  treatmentTypeLabel,
  medication,
  devices,
  onEditMedication,
  researchConsent,
  researchWithdrawn,
  onToggleResearchConsent,
  labels
}: BackgroundCardProps) {
  return (
    <section className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
      <h2 className="font-display text-[18px] leading-tight text-ink">
        {labels.title}
      </h2>
      {summary && (
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          {summary}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-2 border-t border-stone pt-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <span className="text-ink-muted">{labels.treatment}</span>
          <span className="inline-flex items-center rounded-full border border-stone bg-stone-soft px-2.5 py-0.5 text-[12px] font-semibold text-ink-soft">
            {treatmentTypeLabel}
          </span>
        </div>
        <div className="flex items-start justify-between gap-2 text-[13px]">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-ink-muted">{labels.medication}</span>
            {medication ? (
              <span className="text-ink-soft">{medication}</span>
            ) : (
              <span className="text-ink-muted">{labels.medicationNone}</span>
            )}
          </span>
          {onEditMedication && (
            <button
              type="button"
              onClick={onEditMedication}
              className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-2.5 py-1 text-[12px] font-semibold text-sage-deep hover:bg-stone-soft"
            >
              {labels.edit}
            </button>
          )}
        </div>
        {devices && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px]">
            <span className="text-ink-muted">{labels.devices}</span>
            <span className="text-ink-soft">{devices}</span>
          </div>
        )}
        {researchConsent !== undefined && (
          <div className="flex items-start justify-between gap-2 text-[13px]">
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-ink-muted">{labels.research}</span>
              <span
                className={
                  researchConsent
                    ? 'inline-flex items-center rounded-full border border-sage-soft bg-sage-soft/40 px-2.5 py-0.5 text-[12px] font-semibold text-sage-deep'
                    : researchWithdrawn
                      ? 'inline-flex items-center rounded-full border border-amber-soft bg-amber-soft/40 px-2.5 py-0.5 text-[12px] font-semibold text-amber-deep'
                      : 'inline-flex items-center rounded-full border border-stone bg-stone-soft px-2.5 py-0.5 text-[12px] font-semibold text-ink-soft'
                }
              >
                {researchConsent
                  ? labels.researchOn
                  : researchWithdrawn
                    ? labels.researchWithdrawn
                    : labels.researchOff}
              </span>
            </span>
            {onToggleResearchConsent && (
              <button
                type="button"
                onClick={onToggleResearchConsent}
                className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-2.5 py-1 text-[12px] font-semibold text-sage-deep hover:bg-stone-soft"
              >
                {researchConsent ? labels.researchWithdrawAction : labels.researchGrant}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
