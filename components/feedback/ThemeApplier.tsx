'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/supabase/auth';
import { applyScheme } from '@/lib/supabase/colorScheme';
import { schemeForOsPreference } from '@/lib/palettes';

/**
 * Applies the active colour scheme to the document root. Mount once
 * near the top of the tree (after AuthProvider), alongside
 * TextScaleApplier.
 *
 * Resolution order:
 *   1. The signed-in profile's saved color_scheme, if set.
 *   2. Otherwise the device's OS light/dark preference — so a
 *      light-sensitive patient whose phone is in dark mode gets a dark
 *      app on first run, before they ever open the picker.
 *
 * globals.css :root already holds the light scheme's values, so if
 * this never ran the app would still render correctly in light — this
 * only ever needs to override.
 */
export function ThemeApplier() {
  const { profile } = useAuth();

  useEffect(() => {
    if (profile?.colorScheme) {
      applyScheme(profile.colorScheme);
      return;
    }
    // No saved choice — follow the OS.
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    applyScheme(schemeForOsPreference(!!prefersDark));
  }, [profile?.colorScheme]);

  // When following the OS (no saved choice), react to the OS changing
  // mid-session.
  useEffect(() => {
    if (profile?.colorScheme) return;
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () =>
      applyScheme(schemeForOsPreference(mq.matches));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [profile?.colorScheme]);

  return null;
}
