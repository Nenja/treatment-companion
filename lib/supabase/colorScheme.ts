'use client';

import { useMutation } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import { useAuth } from './auth';
import { getScheme, type SchemeId } from '@/lib/palettes';

/**
 * Saves the user's colour-scheme choice to their profile row, and
 * applies it immediately so the change feels instant.
 *
 * Mirrors useSetTextScale: RLS permits self-update on profile; on
 * success the auth profile is refreshed so every consumer (and the
 * ThemeApplier) sees the new value.
 */
export function useSetColorScheme() {
  const { refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (schemeId: SchemeId): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) throw new Error('Not signed in');

      // Optimistic apply — write the scheme's variables onto <html>
      // now, so the UI re-themes before the round-trip completes.
      applyScheme(schemeId);

      const { error } = await supabase
        .from('profile')
        .update({ color_scheme: schemeId })
        .eq('id', userResp.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void refreshProfile();
    }
  });
}

/**
 * Writes a scheme's twelve+ colour variables onto the document root.
 * Exported so the ThemeApplier (initial load) and the setter hook
 * (live change) share one implementation.
 */
export function applyScheme(schemeId: string): void {
  if (typeof document === 'undefined') return;
  const scheme = getScheme(schemeId);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(scheme.colors)) {
    root.style.setProperty(key, value);
  }
  // Expose the active scheme + its darkness for any CSS that needs it
  // (e.g. native form controls via color-scheme).
  root.setAttribute('data-scheme', scheme.id);
  root.style.setProperty('color-scheme', scheme.isDark ? 'dark' : 'light');
}
