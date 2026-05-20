import type { ReactNode } from 'react';
import { TopBar } from './TopBar';

interface AppShellProps {
  children: ReactNode;
}

/**
 * Mobile-first container. Max width tuned to common phone widths so the
 * layout doesn't feel sparse on tablet/desktop but stays one-handed on
 * mobile. Sign-out and account info live in the TopBar's AccountMenu.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-cream">
      <TopBar />
      <main className="mx-auto max-w-[480px] px-5 pb-16 pt-6">{children}</main>
    </div>
  );
}
