'use client';

import { useTranslations } from 'next-intl';

/**
 * Slim, brand-only strip shown at the very top of every page (rendered
 * once in the locale layout). Carries just the mark + product name so the
 * brand is consistent everywhere; account / help / page controls stay in
 * each page's own header below this strip. Intentionally a plain <div>
 * (not <header>) and non-interactive, so it adds no extra banner landmark
 * and never sits before a page's skip-to-content link in the tab order.
 */
export function BrandBar() {
  const t = useTranslations('app');
  return (
    <div className="border-b border-stone/70 bg-cream-soft">
      {/* The strip spans the viewport, but its content is centred at the
          page content width (mid / 720px) and left-padded the same as the
          page body, so the mark sits at the top-left of the content
          column — aligned with the page below, not jammed into the
          viewport's far corner. (720px matches the main clinician work
          pages — treatment, patient, new-goal, physio patient. The few
          wider/narrower pages may sit a touch off until matched per-page.) */}
      <div className="mx-auto flex max-w-[var(--max-w-page-mid)] items-center gap-2.5 px-5 py-2.5">
        {/* Mark: a soft sage chevron — quiet visual identity, no logotype */}
        <svg
          aria-hidden
          width="22"
          height="22"
          viewBox="0 0 22 22"
          className="text-sage-deep"
        >
          <path
            d="M3 13 L11 5 L19 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 17.5 L11 9.5 L19 17.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.35"
          />
        </svg>
        <span className="font-display text-[17px] tracking-tight text-ink">
          {t('name')}
        </span>
      </div>
    </div>
  );
}
