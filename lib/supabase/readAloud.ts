'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

/**
 * Saves the read-aloud accessibility opt-in to the user's profile row.
 * RLS allows self-update on profile (same path as text scale / palette).
 * The AuthProvider re-fetches on success so every consumer — the
 * settings toggle and the read-aloud buttons themselves — sees it.
 */
export function useSetReadAloud() {
  const qc = useQueryClient();
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
      qc.invalidateQueries({ queryKey: ['auth'] });
    }
  });
}
