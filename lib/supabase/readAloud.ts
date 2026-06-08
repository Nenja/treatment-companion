'use client';

import { useMutation } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import { useAuth } from './auth';

/**
 * Saves the read-aloud accessibility opt-in to the user's profile row.
 * RLS allows self-update on profile (same path as text scale / palette).
 *
 * On success it calls refreshProfile() so every consumer — the settings
 * toggle and the read-aloud buttons themselves — sees the new value
 * immediately. (The profile lives in AuthProvider's own state, not a
 * react-query cache, so invalidating a query key would do nothing —
 * the toggle would only take effect after a full reload.)
 */
export function useSetReadAloud() {
  const { refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (enabled: boolean): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) throw new Error('Not signed in');

      const { error } = await supabase
        .from('profile')
        .update({ read_aloud: enabled })
        .eq('id', userResp.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void refreshProfile();
    }
  });
}
