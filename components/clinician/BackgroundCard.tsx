'use client';

type ConsentTone = 'on' | 'warn' | 'off';

interface BackgroundCardProps {
  /** Demographics line (age / diagnosis / side / ambulation), if known. */
  summary: string | null;
  /** Current treatment modality, e.g. "Botulinum toxin". */
  treatmentTypeLabel: string;
  medication?: string | null;
  devices?: string | null;
  onEditMedication?: () => void;
  /** General research consent (migration 0098). Undefined hides the consent block. */
  researchConsent?: boolean;
  researchWithdrawn?: boolean;
  onToggleResearchConsent?: () => void;
  /** Consent to use videos for educational purposes. Undefined hides its row. */
  educationalConsent?: boolean;
  onToggleEducationalConsent?: () => void;
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
    educational: string;
    educationalOn: string;
    educationalOff: string;
    educationalGrant: string;
    educationalWithdrawAction: string;
  };
}

/** One consent line: label on its own row, then status pill + action button
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
  onAction?: () => void;
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
        {onAction && (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-2.5 py-1 text-[12px] font-semibold text-sage-deep hover:bg-stone-soft"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Static patient background for the cockpit's context column: demographics,
 * treatment type, current medication, and the care-consent status (research +
 * educational video use), gathered into one card below the "since last visit"
 * panel.
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
  educationalConsent,
  onToggleEducationalConsent,
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

      {/* Reference facts */}
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
      </div>

      {/* Care consents */}
      {researchConsent !== undefined && (
        <div className="mt-3 flex flex-col gap-3 border-t border-stone pt-3">
          <ConsentRow
            label={labels.research}
            tone={researchConsent ? 'on' : researchWithdrawn ? 'warn' : 'off'}
            status={
              researchConsent
                ? labels.researchOn
                : researchWithdrawn
                  ? labels.researchWithdrawn
                  : labels.researchOff
            }
            actionLabel={
              researchConsent ? labels.researchWithdrawAction : labels.researchGrant
            }
            onAction={onToggleResearchConsent}
          />
          {educationalConsent !== undefined && (
            <ConsentRow
              label={labels.educational}
              tone={educationalConsent ? 'on' : 'off'}
              status={educationalConsent ? labels.educationalOn : labels.educationalOff}
              actionLabel={
                educationalConsent
                  ? labels.educationalWithdrawAction
                  : labels.educationalGrant
              }
              onAction={onToggleEducationalConsent}
            />
          )}
        </div>
      )}
    </section>
  );
}
