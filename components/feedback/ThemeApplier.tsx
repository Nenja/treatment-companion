'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/supabase/auth';
import { applyAppearance } from '@/lib/supabase/colorScheme';
import { themeForOsPreference } from '@/lib/palettes';

/**
 * Applies the active appearance (theme + high-contrast toggle) to the
 * document root. Mount once near the top of the tree (after
 * AuthProvider), alongside TextScaleApplier.
 *
 * Resolution order:
 *   1. The signed-in profile's saved theme + high_contrast.
 *   2. If no theme has ever been chosen, follow the device's OS
 *      light/dark preference — so a light-sensitive patient whose
 *      phone is in dark mode gets a dark app on first run, before they
 *      open the picker. The high-contrast toggle still applies if set.
 *
 * globals.css :root holds the warm-day values, so if this never ran
 * the app still renders correctly in the default theme — this only
 * ever overrides.
 */
export function ThemeApplier() {
  const { profile } = useAuth();
  const savedTheme = profile?.colorScheme ?? null;
  const highContrast = profile?.highContrast ?? false;

  useEffect(() => {
    if (savedTheme) {
      applyAppearance(savedTheme, highContrast);
      return;
    }
    // No saved theme — follow the OS for day/night, but still honour
    // the high-contrast toggle if the user has turned it on.
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    applyAppearance(themeForOsPreference(!!prefersDark), highContrast);
  }, [savedTheme, highContrast]);

  // When following the OS (no saved theme), react to the OS changing
  // mid-session.
  useEffect(() => {
    if (savedTheme) return;
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () =>
      applyAppearance(themeForOsPreference(mq.matches), highContrast);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [savedTheme, highContrast]);

  return null;
}
