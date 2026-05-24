import type { ReactNode } from 'react';
import { TopBar } from './TopBar';

interface AppShellProps {
  children: ReactNode;
}

/**
 * Mobile-first container. Max width tuned to common phone widths so the
 * layout doesn't feel sparse on tablet/desktop but stays one-handed on
 * mobile. Sign-out and account info live in the TopBar's AccountMenu.
 *
 * Includes a skip-to-content link as the first focusable element: a
 * keyboard or switch-device user (motor impairment is common in this
 * patient group) can jump past the TopBar straight to the main content
 * instead of tabbing through the header on every page. The link is
 * visually hidden until focused.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-cream">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-[var(--radius-button)] focus:bg-sage-deep focus:px-4 focus:py-2.5 focus:text-[15px] focus:font-semibold focus:text-on-accent"
      >
        Skip to main content
      </a>
      <TopBar />
      <main
        id="main-content"
        className="mx-auto max-w-[480px] px-5 pb-16 pt-6"
      >
        {children}
      </main>
    </div>
  );
}
