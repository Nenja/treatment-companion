'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';

/**
 * Side slide-over that hosts a cockpit action panel (medication, training,
 * therapist input) over the patient page — the same non-intrusive pattern
 * as RecordGoalDrawer, replacing the old inline panels that opened "in the
 * middle of everything" in the left column.
 *
 * Pure chrome: overlay + right-aligned panel + a close button + focus
 * management (via useModalA11y) + a scrollable body. The caller passes the
 * panel's existing content as children, so each panel keeps its own
 * heading and controls unchanged.
 */
export function CockpitPanelDrawer({
  onClose,
  children
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const tA11y = useTranslations('a11y');
  const containerRef = useModalA11y(onClose);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        className="flex h-full w-full max-w-[520px] flex-col border-l border-stone bg-cream shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-end border-b border-stone/70 bg-cream px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            aria-label={tA11y('close')}
            className="flex h-11 w-11 items-center justify-center rounded-md text-ink-soft hover:bg-stone-soft hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
