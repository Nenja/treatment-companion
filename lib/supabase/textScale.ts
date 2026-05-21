'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

/**
 * Saves the patient's text-scale preference to their profile row.
 * RLS allows self-update on profile. The TextScaleApplier picks up
 * the new value via the AuthProvider's refresh path; in the meantime,
 * we also set the CSS variable directly so the change feels instant.
 */
export function useSetTextScale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (scale: 1.0 | 1.25 | 1.5): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) throw new Error('Not signed in');

      // Optimistic visual update — the actual reload is below.
      document.documentElement.style.setProperty(
        '--text-scale',
        String(scale)
      );

      const { error } = await supabase
        .from('profile')
        .update({ text_scale: scale })
        .eq('id', userResp.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Force AuthProvider to re-fetch the profile so other consumers
      // see the new value too.
      qc.invalidateQueries({ queryKey: ['auth'] });
    }
  });
}
