'use client';

import { useMutation } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import { useAuth } from './auth';

/**
 * Persist the user's preferred interface language onto their profile.
 *
 * Mirrors the appearance setters (colorScheme / nightMode): apply
 * optimistically via patchProfile so the picker highlights the new
 * choice at once, then write `preferred_locale` to the profile row
 * (RLS permits self-update) and refresh the auth profile on success.
 *
 * The URL-locale switch (which actually re-renders the UI in the new
 * language) is done by the caller via the router — this hook only owns
 * the stored preference, so the choice survives the next sign-in.
 */
export type AppLocale = 'en' | 'da' | 'sv' | 'nb';

export function useSetPreferredLocale() {
  const { refreshProfile, patchProfile } = useAuth();
  return useMutation({
    mutationFn: async (locale: AppLocale): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) throw new Error('Not signed in');

      patchProfile({ preferredLocale: locale });

      const { error } = await supabase
        .from('profile')
        .update({ preferred_locale: locale })
        .eq('id', userResp.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void refreshProfile();
    }
  });
}
