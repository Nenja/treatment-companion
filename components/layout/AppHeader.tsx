'use client';

import type { ReactNode } from 'react';
import { AccountMenu } from './AccountMenu';
import { BrandMark } from './BrandMark';
import { PageHelpButton } from '@/components/feedback/PageHelpButton';

type HeaderWidth =
  | 'narrow'
  | 'mid'
  | 'wide'
  | 'narrowToMid'
  | 'narrowToWide';

const WIDTH_CLASS: Record<HeaderWidth, string> = {
  narrow: 'max-w-[var(--max-w-page-narrow)]',
  mid: 'max-w-[var(--max-w-page-mid)]',
  wide: 'max-w-[var(--max-w-page-wide)]',
  narrowToMid:
    'max-w-[var(--max-w-page-narrow)] lg:max-w-[var(--max-w-page-mid)]',
  narrowToWide:
    'max-w-[var(--max-w-page-narrow)] lg:max-w-[var(--max-w-page-wide)]'
};

interface AppHeaderProps {
  /** Inner-row max width — match the page's <main> so the brand lines up
   *  with the content column. */
  width?: HeaderWidth;
  /** Escape hatch for a one-off page width, e.g. 'max-w-[640px]'. */
  maxWidthClass?: string;
  /** Optional leading back / cancel link. The arrow always shows; the
   *  label is hidden on the smallest screens to keep the row compact. */
  back?: { label: ReactNode; onClick: () => void };
  /** Optional middle content. For a page title, give the node
   *  `block truncate text-center`; for a patient-name link, leave it
   *  left-aligned. Sits in a flexible, truncating slot. */
  middle?: ReactNode;
  /** Optional right-side controls placed before help + account
   *  (e.g. an end-session button). */
  actions?: ReactNode;
  /** When set, a help button for this page appears before the account. */
  helpPageKey?: string;
  /** Show the account menu (default true). */
  showAccount?: boolean;
  /** Wordmark visibility. 'auto' (default): shown only when the row is
   *  otherwise empty (no back / middle / actions); on busier headers only
   *  the mark shows, with the wordmark returning on large screens. */
  brandName?: 'auto' | 'always' | 'never';
}

/**
 * The single header used across the app's standard pages. One row:
 * the brand on the left, then optional back link / title / patient-name
 * in the middle, and help + account always hard right. Because the row
 * always has a left (brand) and a right (controls) group, the account
 * menu can never drift to the left, and the brand always shares the line
 * with the controls. Replaces the old separate BrandBar strip.
 */
export function AppHeader({
  width = 'narrow',
  maxWidthClass,
  back,
  middle,
  actions,
  helpPageKey,
  showAccount = true,
  brandName = 'auto'
}: AppHeaderProps) {
  const widthCls = maxWidthClass ?? WIDTH_CLASS[width];
  const sparse = !back && middle == null && !actions;
  const nameClass =
    brandName === 'always' ? 'inline' : sparse ? 'inline' : 'hidden lg:inline';

  return (
    <header className="border-b border-stone/70 bg-cream-soft/50 backdrop-blur-sm">
      <div className={`mx-auto flex items-center gap-3 px-5 py-3 ${widthCls}`}>
        <div className="flex shrink-0 items-center gap-2.5">
          {back && (
            <button
              type="button"
              onClick={back.onClick}
              className="shrink-0 text-[14px] font-semibold text-ink-soft hover:text-ink"
            >
              <span aria-hidden>←</span>
              <span className="ml-1 hidden sm:inline">{back.label}</span>
              <span className="sr-only sm:hidden">{back.label}</span>
            </button>
          )}
          <BrandMark showName={brandName !== 'never'} nameClassName={nameClass} />
        </div>

        {/* Middle slot — always rendered so it acts as a flex spacer that
            keeps the controls hard right even when empty. */}
        <div className="min-w-0 flex-1 truncate">{middle}</div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {actions}
          {helpPageKey && <PageHelpButton pageKey={helpPageKey} />}
          {showAccount && <AccountMenu />}
        </div>
      </div>
    </header>
  );
}
