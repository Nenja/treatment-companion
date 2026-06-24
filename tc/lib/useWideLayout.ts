'use client';

import { useAuth } from './supabase/auth';

/**
 * Whether the desktop two-pane (wide) layout should be applied for the
 * current user.
 *
 * The layout preference lives on the profile ('wide' | 'compact').
 * This returns true when the preference is 'wide' (the default).
 *
 * Note this is a *preference* check, not a screen-size check. The
 * actual collapsing to single-column on small screens is still done
 * with Tailwind's `lg:` breakpoint in the page markup. So the full
 * behaviour is the combination:
 *
 *   preference 'wide'    + screen ≥1024px → two-pane
 *   preference 'wide'    + screen <1024px → single-column (lg: off)
 *   preference 'compact' + any screen     → single-column
 *
 * A page uses this to decide whether to emit its `lg:grid …` classes
 * at all: when false, it omits them and stays single-column even on a
 * wide screen.
 */
export function useWideLayout(): boolean {
  const { profile } = useAuth();
  // For now the compact option is hidden for clinicians, so the clinician
  // cockpit always uses the wide (two-pane) layout — force it regardless of any
  // stored preference so no clinician is stranded in compact. (Therapists keep
  // their choice.)
  if (profile?.role === 'clinician') return true;
  return (profile?.layoutPreference ?? 'wide') === 'wide';
}
