'use client';

import { useMutation } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import { useAuth } from './auth';
import {
  resolveColors,
  resolvePaletteId,
  type PaletteId
} from '@/lib/palettes';

/**
 * Appearance setters.
 *
 * Appearance is two stored values on the profile:
 *   - color_scheme — the chosen PALETTE id
 *   - night_mode   — the day/night toggle
 *
 * Both hooks apply the change optimistically (writing the CSS
 * variables onto <html> immediately) and then persist it. RLS permits
 * self-update on the profile row; on success the auth profile is
 * refreshed so every consumer — including ThemeApplier — sees it.
 *
 * Each setter needs BOTH current values to apply correctly, so the
 * caller passes the current value of the other field.
 */

/** Set the colour palette. `currentNight` is the day/night toggle's
 *  current state, needed so the optimistic apply resolves correctly. */
export function useSetPalette() {
  const { refreshProfile, patchProfile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      paletteId: PaletteId;
      currentNight: boolean;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) throw new Error('Not signed in');

      applyAppearance(input.paletteId, input.currentNight);
      // Optimistic profile update so the active palette highlights at once.
      patchProfile({ colorScheme: input.paletteId });

      const { error } = await supabase
        .from('profile')
        .update({ color_scheme: input.paletteId })
        .eq('id', userResp.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void refreshProfile();
    }
  });
}

/** Set the day/night toggle. `currentPalette` is the palette id the
 *  toggle is being applied to. */
export function useSetNightMode() {
  const { refreshProfile, patchProfile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      night: boolean;
      currentPalette: string | null;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) throw new Error('Not signed in');

      applyAppearance(input.currentPalette, input.night);
      // Optimistic profile update so the day/night highlight flips at once.
      patchProfile({
        nightMode: input.night,
        colorScheme: resolvePaletteId(input.currentPalette)
      });

      // Persist a CONCRETE palette id alongside night_mode. ThemeApplier only
      // honours a saved night_mode once a palette has been chosen
      // (`hasSavedChoice = colorScheme != null`); without this, a user who
      // never opened the palette picker would toggle night, see it flash on,
      // then have ThemeApplier fall back to the OS preference and revert —
      // i.e. "nothing changes". Toggling night IS an explicit appearance
      // choice, so we record the resolved palette (default 'green') to make
      // the choice stick.
      const { error } = await supabase
        .from('profile')
        .update({
          night_mode: input.night,
          color_scheme: resolvePaletteId(input.currentPalette)
        })
        .eq('id', userResp.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void refreshProfile();
    }
  });
}

/**
 * Write the resolved appearance (palette + day/night) onto the
 * document root. Exported so the ThemeApplier (initial load) and the
 * setter hooks (live change) share one implementation.
 */
export function applyAppearance(
  paletteIdOrLegacy: string | null | undefined,
  night: boolean
): void {
  if (typeof document === 'undefined') return;
  const { colors, isDark, appliedId } = resolveColors(
    paletteIdOrLegacy,
    night
  );
  const root = document.documentElement;
  for (const [key, value] of Object.entries(colors)) {
    root.style.setProperty(key, value);
  }
  root.setAttribute('data-scheme', appliedId);
  root.style.setProperty('color-scheme', isDark ? 'dark' : 'light');
}
