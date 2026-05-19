'use client';

import { useTranslations } from 'next-intl';
import { AccountMenu } from './AccountMenu';

export function TopBar() {
  const t = useTranslations('app');

  return (
    <header className="border-b border-stone/70 bg-cream-soft/50 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[480px] items-center justify-between px-5 py-3">
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
