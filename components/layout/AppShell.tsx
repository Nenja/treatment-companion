import type { ReactNode } from 'react';
import { TopBar } from './TopBar';

interface AppShellProps {
  children: ReactNode;
  /** When true, the page body expands from the narrow (480px) width
   *  to the wide (1080px) width at the `lg:` breakpoint. Use for
   *  pages whose audience is on a desktop or wide window (clinician
   *  work, therapist work in a clinic). Mobile and narrow windows
   *  still get the narrow width. Defaults to false. */
  wide?: boolean;
  /** When set, a "?" help button for this page appears in the TopBar,
   *  opening the help modal for that page. */
  helpPageKey?: string;
}

/**
 * Page container with a TopBar header.
 *
 * Default (`wide={false}`): mobile-first, 480px max — for patient
 * surfaces (front page, check-in, suggest-goal, profile, etc.). The
 * audience here is on a phone.
 *
 * Wide (`wide={true}`): responsive — 480px on narrow windows, expands
 * to 1080px at the `lg:` breakpoint (≥1024px). For clinician and
 * therapist surfaces where the audience may be at a desktop. On a
 * phone or narrow window, behaves identically to the narrow variant.
 *
 * Includes a skip-to-content link as the first focusable element: a
 * keyboard or switch-device user (motor impairment is common in this
 * patient group) can jump past the TopBar straight to the main
 * content instead of tabbing through the header on every page. The
 * link is visually hidden until focused.
 */
export function AppShell({ children, wide = false, helpPageKey }: AppShellProps) {
  const mainWidthClass = wide
    ? 'max-w-[var(--max-w-page-narrow)] lg:max-w-[var(--max-w-page-wide)]'
    : 'max-w-[var(--max-w-page-narrow)]';

  return (
    <div className="min-h-dvh bg-cream">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-[var(--radius-button)] focus:bg-sage-deep focus:px-4 focus:py-2.5 focus:text-[15px] focus:font-semibold focus:text-on-accent"
      >
        Skip to main content
      </a>
      <TopBar wide={wide} helpPageKey={helpPageKey} />
      <main
        id="main-content"
        className={`mx-auto px-5 pb-16 pt-6 ${mainWidthClass}`}
      >
        {children}
      </main>
    </div>
  );
}
