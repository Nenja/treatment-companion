'use client';

import { useMutation } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import { useAuth } from './auth';

/**
 * Saves the patient's text-scale preference to their profile row.
 * RLS allows self-update on profile.
 *
 * The active size shown in the account menu is read from the auth
 * profile, so the profile must update for the highlight to track the
 * choice. We do it in two steps: patchProfile() flips the in-memory
 * value immediately (instant, correct highlight) and refreshProfile()
 * reconciles with the persisted row. The CSS variable is also set
 * directly so the visible text resizes without waiting on either.
 *
 * (Previously this called qc.invalidateQueries(['auth']), but the auth
 * profile is plain React state — not a query by that key — so the
 * invalidate was a no-op and the highlight stuck on the old size.)
 */
export function useSetTextScale() {
  const { patchProfile, refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (scale: 1.0 | 1.25 | 1.5 | 2.0): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) throw new Error('Not signed in');

      // Optimistic visual + state update so the change feels instant and
      // the active-size highlight moves immediately.
      document.documentElement.style.setProperty('--text-scale', String(scale));
      patchProfile({ textScale: scale });

      const { error } = await supabase
        .from('profile')
        .update({ text_scale: scale })
        .eq('id', userResp.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void refreshProfile();
    }
  });
}
