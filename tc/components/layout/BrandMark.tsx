'use client';

import { useTranslations } from 'next-intl';

/**
 * The product's visual identity: a soft sage double-chevron mark, with
 * the wordmark ("Treatment Companion") shown next to it. Used in every
 * page header (via AppHeader, the patient-name headers, and the check-in
 * wizard) so the brand reads consistently everywhere.
 *
 * `showName` toggles the wordmark; `nameClassName` lets a caller make the
 * wordmark responsive (e.g. hidden on small, shown on large) when the
 * header is otherwise busy.
 */
export function BrandMark({
  showName = true,
  nameClassName = ''
}: {
  showName?: boolean;
  nameClassName?: string;
}) {
  const t = useTranslations('app');
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      <svg
        aria-hidden
        width="22"
        height="22"
        viewBox="0 0 22 22"
        className="shrink-0 text-sage-deep"
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
      {showName && (
        <span
          className={`font-display text-[17px] tracking-tight text-ink whitespace-nowrap ${nameClassName}`}
        >
          {t('name')}
        </span>
      )}
    </span>
  );
}
