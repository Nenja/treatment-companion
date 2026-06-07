'use client';

import { useEffect, useRef } from 'react';

/**
 * Accessibility helper for modal dialogs.
 *
 * Responsibilities:
 *   1. When the modal mounts, remember the previously-focused element
 *      (the trigger button) so we can restore focus when the modal
 *      closes. This means keyboard users don't lose their place.
 *   2. Move focus into the modal on mount. We pick the first focusable
 *      element inside the container.
 *   3. Trap Tab inside the modal so keyboard users can't accidentally
 *      tab to background content while the modal is open.
 *   4. Listen for Escape; call onClose when pressed.
 *   5. Apply a brief entrance animation: the modal starts slightly
 *      offset and transparent, then settles into place. Reduced-motion
 *      users get an instant transition via the global CSS rule.
 *
 * Caller responsibilities:
 *   - Attach the returned ref to the modal's outer container.
 *   - Pass onClose so we can invoke it on Escape.
 *   - Render the modal conditionally (so the hook unmounts on close,
 *     which is what triggers the focus restoration).
 *
 * Note: there is intentionally no exit animation. React unmounts the
 * component cleanly; adding an exit animation would require keeping
 * the modal mounted during dismiss, which complicates focus restore.
 */
export function useModalA11y(onClose: () => void) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Remember who was focused before we opened.
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Lock background scroll for the modal's lifetime so the page behind
    // can't wheel/trackpad-scroll under the dialog (a "where am I" hazard
    // on long pages). The previous inline value is restored on unmount.
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const container = containerRef.current;
    if (container) {
      // Apply entrance animation. Start state set as inline style so
      // it doesn't matter whether the container has Tailwind classes
      // that would conflict. requestAnimationFrame lets the browser
      // paint the start state before we flip to the end state, which
      // is what makes the transition visible.
      container.style.transition =
        'opacity 200ms ease-out, transform 200ms ease-out';
      container.style.opacity = '0';
      container.style.transform = 'translateY(8px) scale(0.98)';
      requestAnimationFrame(() => {
        if (container) {
          container.style.opacity = '1';
          container.style.transform = 'translateY(0) scale(1)';
        }
      });

      // Focus the first focusable element inside the modal. If there's
      // nothing focusable, focus the container itself (after making it
      // focusable via tabindex=-1).
      const firstFocusable = container.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        container.setAttribute('tabindex', '-1');
        container.focus();
      }
    }

    // Esc-to-close + tab trap.
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const node = containerRef.current;
      if (!node) return;
      const focusables = Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handler);

    return () => {
      document.removeEventListener('keydown', handler);
      // Restore background scroll.
      document.body.style.overflow = prevBodyOverflow;
      // Restore focus to the trigger element when the modal unmounts.
      // Wrap in setTimeout(0) because the parent component may also
      // be moving focus on close (e.g. router push); we want to be
      // last so our restore wins.
      const prev = previouslyFocused.current;
      if (prev && typeof prev.focus === 'function') {
        setTimeout(() => prev.focus(), 0);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return containerRef;
}
