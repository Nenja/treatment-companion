'use client';

import { useMutation } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import { useAuth } from './auth';

/**
 * Navigation-style preference setter (0078).
 *
 * Stored on the profile as `nav_style`:
 *   'top'  — horizontal icon row under the patient name (default)
 *   'side' — vertical icon rail on the left, content to the right
 *
 * Only meaningful on large screens (a left rail needs the width); phones
 * and narrow windows stay with the stacked body row regardless. Persisted
 * on the profile so the choice follows the user across devices. RLS permits
 * self-update on the profile row (same as layout_preference).
 */
export function useSetNavStyle() {
  const { refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (input: { navStyle: 'top' | 'side' }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) throw new Error('Not signed in');

      const { error } = await supabase
        .from('profile')
        .update({ nav_style: input.navStyle })
        .eq('id', userResp.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void refreshProfile();
    }
  });
}
