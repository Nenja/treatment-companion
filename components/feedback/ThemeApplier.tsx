'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/supabase/auth';
import { applyAppearance } from '@/lib/supabase/colorScheme';
import { applyDesign } from '@/lib/design';

/**
 * Applies the active appearance (palette + day/night) to the document
 * root. Mount once near the top of the tree (after AuthProvider),
 * alongside TextScaleApplier.
 *
 * Resolution order:
 *   1. The signed-in profile's saved color_scheme + night_mode.
 *   2. If no palette has ever been chosen, the default palette is
 *      used, but day/night still follows the device's OS preference
 *      on first run — so a light-sensitive patient whose phone is in
 *      dark mode gets a dark app before they open the picker.
 *
 * globals.css :root holds the green-day values, so if this never ran
 * the app still renders correctly in the default palette — this only
 * ever overrides.
 */
export function ThemeApplier() {
  const { profile } = useAuth();
  const savedPalette = profile?.colorScheme ?? null;
  const savedNight = profile?.nightMode ?? false;
  const hasSavedChoice = savedPalette != null;
  const savedDesign = profile?.designVariant ?? null;

  useEffect(() => {
    applyDesign(savedDesign);
  }, [savedDesign]);

  useEffect(() => {
    if (hasSavedChoice) {
      applyAppearance(savedPalette, savedNight);
      return;
    }
    // No saved palette — use the default palette, but follow the OS
    // for day/night.
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    applyAppearance(null, !!prefersDark);
  }, [hasSavedChoice, savedPalette, savedNight]);

  // When following the OS (no saved palette), react to the OS changing
  // mid-session.
  useEffect(() => {
    if (hasSavedChoice) return;
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyAppearance(null, mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [hasSavedChoice]);

  return null;
}
