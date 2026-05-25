'use client';

import { useMutation } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import { useAuth } from './auth';
import { resolveColors, type PaletteId } from '@/lib/palettes';

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
  const { refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      paletteId: PaletteId;
      currentNight: boolean;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) throw new Error('Not signed in');

      applyAppearance(input.paletteId, input.currentNight);

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
  const { refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      night: boolean;
      currentPalette: string | null;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) throw new Error('Not signed in');

      applyAppearance(input.currentPalette, input.night);

      const { error } = await supabase
        .from('profile')
        .update({ night_mode: input.night })
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
