'use client';

import { AccountMenu } from './AccountMenu';
import { PageHelpButton } from '@/components/feedback/PageHelpButton';

interface TopBarProps {
  /** When true, the inner row expands to the wide page width on
   *  `lg:` and above. Otherwise stays at the narrow (mobile) width.
   *  Defaults to false (narrow). */
  wide?: boolean;
  /** When set, a "?" help button for this page appears next to the
   *  account menu, opening the help modal for that page. */
  helpPageKey?: string;
}

export function TopBar({ wide = false, helpPageKey }: TopBarProps) {
  // Inner row uses the same width as the page body it sits above, so
  // the account/help controls land in the visual corner rather than
  // offset. The brand mark + name now live in the global BrandBar
  // (rendered once in the layout), so this bar carries only the
  // per-session controls.
  const innerWidthClass = wide
    ? 'max-w-[var(--max-w-page-narrow)] lg:max-w-[var(--max-w-page-wide)]'
    : 'max-w-[var(--max-w-page-narrow)]';

  return (
    <header className="border-b border-stone/70 bg-cream-soft/50 backdrop-blur-sm">
      <div
        className={`mx-auto flex items-center justify-end px-5 py-3 ${innerWidthClass}`}
      >
        <div className="flex items-center gap-2">
          {helpPageKey && <PageHelpButton pageKey={helpPageKey} />}
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
