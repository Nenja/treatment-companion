'use client';

import { useTranslations } from 'next-intl';
import { AccountMenu } from './AccountMenu';

interface TopBarProps {
  /** When true, the inner row expands to the wide page width on
   *  `lg:` and above. Otherwise stays at the narrow (mobile) width.
   *  Defaults to false (narrow). */
  wide?: boolean;
}

export function TopBar({ wide = false }: TopBarProps) {
  const t = useTranslations('app');

  // Inner row uses the same width as the page body it sits above, so
  // the AccountMenu lands in the visual corner rather than offset.
  // When wide, the row stays narrow on small screens and expands at
  // the `lg:` breakpoint.
  const innerWidthClass = wide
    ? 'max-w-[var(--max-w-page-narrow)] lg:max-w-[var(--max-w-page-wide)]'
    : 'max-w-[var(--max-w-page-narrow)]';

  return (
    <header className="border-b border-stone/70 bg-cream-soft/50 backdrop-blur-sm">
      <div
        className={`mx-auto flex items-center justify-between px-5 py-3 ${innerWidthClass}`}
      >
        <div className="flex items-center gap-2.5">
          {/* Mark: a soft sage chevron — a quiet visual identity, no logotype */}
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
        <AccountMenu />
      </div>
    </header>
  );
}
