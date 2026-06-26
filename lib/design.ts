'use client';

/**
 * Design direction — a second appearance axis, orthogonal to the colour
 * palette. The palette controls *colour*; the design direction controls
 * *form* (chiefly corner radius and the overall editorial feel).
 *
 *   current   — the rounded look the app shipped with. Default.
 *   editorial — near-square corners; the "warm editorial" direction.
 *               Keeps the chosen palette's colours and the serif display
 *               font; only the form changes.
 *
 * It is applied by setting `data-design` on <html>; globals.css holds the
 * `[data-design='editorial']` token overrides. Nothing else changes —
 * every component already styles its corners from --radius-card /
 * --radius-button, so flipping those two tokens re-shapes the whole app.
 *
 * Stored on the profile as `design_variant` (NULL = current), mirroring
 * how `color_scheme` stores the palette.
 */

export type DesignId = 'current' | 'editorial';

/** Selectable options, in picker order. */
export const DESIGN_IDS: DesignId[] = ['current', 'editorial'];

const DEFAULT_DESIGN: DesignId = 'current';

/** Map a stored value (possibly NULL/legacy) to a DesignId. */
export function resolveDesignId(stored: string | null | undefined): DesignId {
  return stored === 'editorial' ? 'editorial' : DEFAULT_DESIGN;
}

/**
 * Write the design direction onto the document root. Shared by the
 * ThemeApplier (initial load) and the setter hook (live change), the
 * same split used for the palette.
 */
export function applyDesign(stored: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-design', resolveDesignId(stored));
}
