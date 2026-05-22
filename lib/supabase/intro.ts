'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

/**
 * Marks the one-time orientation panel as seen for the current user.
 * Self-update on the own profile row is permitted by RLS. After it
 * succeeds the auth profile is refreshed so the panel disappears.
 */
export function useDismissIntro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('profile')
        .update({ has_seen_intro: true })
        .eq('id', userResp.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth'] });
    }
  });
}
