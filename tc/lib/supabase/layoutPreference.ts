'use client';

import { useMutation } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import { useAuth } from './auth';

/**
 * Layout preference setter.
 *
 * Stored as a single value on the profile: `layout_preference`, one of
 *   'wide'    — two-pane layout on large screens
 *   'compact' — single-column layout even on large screens
 *
 * Only meaningful on large screens (>=1024px); phones and narrow
 * windows are always single-column. Persisted on the profile so the
 * choice follows the user across devices. RLS permits self-update on
 * the profile row (same as color_scheme / night_mode / text_scale).
 *
 * patchProfile() flips the in-memory preference immediately so the
 * active control highlights at once; refreshProfile() then reconciles
 * with the persisted row, and every wide-capable page re-renders with
 * the chosen layout.
 */
export function useSetLayoutPreference() {
  const { refreshProfile, patchProfile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      preference: 'wide' | 'compact';
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) throw new Error('Not signed in');

      patchProfile({ layoutPreference: input.preference });

      const { error } = await supabase
        .from('profile')
        .update({ layout_preference: input.preference })
        .eq('id', userResp.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void refreshProfile();
    }
  });
}
