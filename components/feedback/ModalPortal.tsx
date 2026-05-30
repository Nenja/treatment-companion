'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders its children into document.body via a portal.
 *
 * Why this exists: a `position: fixed` overlay anchors to the nearest
 * ancestor that establishes a containing block — which includes any
 * ancestor with a `transform`, `filter`, or `backdrop-filter`. The
 * TopBar header uses `backdrop-blur`, so a modal rendered from a button
 * inside the header (e.g. the page-help "?") would anchor to the thin
 * header box instead of the viewport, leaving it clipped to the top
 * bar. Portalling the modal to document.body sidesteps every such
 * ancestor, so `fixed inset-0` covers the real viewport.
 *
 * SSR-safe: portals only after mount (document is unavailable on the
 * server), returning null on the first render.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
