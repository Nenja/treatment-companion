'use client';

interface PatientBannerProps {
  modalityLabel: string;
}

/**
 * The current treatment modality, shown as a small badge that leads the
 * "since last visit" panel in the context column. (It also gives the
 * top-alignment band on the wide layout something to sit in so "since last
 * visit" lines up with the first goal graph.)
 *
 * The patient's demographics summary now lives under the name in the page
 * header — its natural home next to the identity — rather than floating here.
 */
export function PatientBanner({ modalityLabel }: PatientBannerProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex shrink-0 items-center rounded-full border border-stone bg-stone-soft px-2.5 py-1 text-[12px] font-semibold text-ink-soft">
        {modalityLabel}
      </span>
    </div>
  );
}
