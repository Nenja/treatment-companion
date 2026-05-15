import type { ReactNode } from 'react';
import { TopBar } from './TopBar';
import { DevPanel } from '../dev/DevPanel';

interface AppShellProps {
  children: ReactNode;
}

/**
 * Mobile-first container. Max width tuned to common phone widths so the
 * layout doesn't feel sparse on tablet/desktop but stays one-handed on
 * mobile. Generous bottom padding keeps the safety notice clear of the
 * floating dev panel.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-cream">
      <TopBar />
      <main className="mx-auto max-w-[480px] px-5 pb-32 pt-6">{children}</main>
      <DevPanel />
    </div>
  );
}
