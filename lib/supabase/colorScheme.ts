'use client';

import { useMutation } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import { useAuth } from './auth';
import { resolveColors, type ThemeId } from '@/lib/palettes';

/**
 * Appearance setters.
 *
 * Appearance is two stored values on the profile:
 *   - color_scheme  — the chosen THEME id
 *   - high_contrast — the high-contrast toggle
 *
 * Both hooks below apply the change optimistically (writing the CSS
 * variables onto <html> immediately) and then persist it. RLS permits
 * self-update on the profile row; on success the auth profile is
 * refreshed so every consumer — including ThemeApplier — sees it.
 *
 * Each setter needs BOTH current values to apply correctly, because
 * high contrast is resolved against the theme's day/night form. The
 * caller passes the current value of the other field.
 */

/** Set the colour theme. `currentHighContrast` is the toggle's current
 *  state, needed so the optimistic apply resolves correctly. */
export function useSetTheme() {
  const { refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      themeId: ThemeId;
      currentHighContrast: boolean;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) throw new Error('Not signed in');

      applyAppearance(input.themeId, input.currentHighContrast);

      const { error } = await supabase
        .from('profile')
        .update({ color_scheme: input.themeId })
        .eq('id', userResp.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void refreshProfile();
    }
  });
}

/** Set the high-contrast toggle. `currentTheme` is the theme id the
 *  toggle is being applied on top of. */
export function useSetHighContrast() {
  const { refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      highContrast: boolean;
      currentTheme: string | null;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) throw new Error('Not signed in');

      applyAppearance(input.currentTheme, input.highContrast);

      const { error } = await supabase
        .from('profile')
        .update({ high_contrast: input.highContrast })
        .eq('id', userResp.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void refreshProfile();
    }
  });
}

/**
 * Write the resolved appearance (theme + high-contrast toggle) onto the
 * document root. Exported so the ThemeApplier (initial load) and the
 * setter hooks (live change) share one implementation.
 */
export function applyAppearance(
  themeIdOrLegacy: string | null | undefined,
  highContrast: boolean
): void {
  if (typeof document === 'undefined') return;
  const { colors, isDark, appliedId } = resolveColors(
    themeIdOrLegacy,
    highContrast
  );
  const root = document.documentElement;
  for (const [key, value] of Object.entries(colors)) {
    root.style.setProperty(key, value);
  }
  // Expose the applied palette + its darkness for any CSS that needs
  // it (e.g. native form controls via color-scheme).
  root.setAttribute('data-scheme', appliedId);
  root.style.setProperty('color-scheme', isDark ? 'dark' : 'light');
}
