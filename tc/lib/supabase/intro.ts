'use client';

import { useMutation } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import { useAuth } from './auth';

/**
 * Marks the one-time orientation panel as seen for the current user.
 * Self-update on the own profile row is permitted by RLS. On success
 * the auth profile is refreshed so profile.hasSeenIntro becomes true
 * in app state (not just in the IntroPanel's local hide).
 */
export function useDismissIntro() {
  const { refreshProfile } = useAuth();
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
      void refreshProfile();
    }
  });
}
