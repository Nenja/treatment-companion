'use client';

import { useMutation } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import { useAuth } from './auth';

/**
 * Lets a signed-in user update their own profile fields from the
 * profile page.
 *
 * RLS permits a user to update their own profile row, so this writes
 * directly (no RPC). On success the auth profile is refreshed so the
 * change is reflected everywhere immediately.
 *
 * Fields:
 *   - displayName     — the user's name, shown across the app.
 *   - profession      — therapist-role only; a display label. The
 *                       caller is responsible for only sending this
 *                       for therapist accounts and for pairing it with
 *                       professionOther when the code is 'other'.
 *   - professionOther — free text, required when profession === 'other',
 *                       and null otherwise (the DB check constraint in
 *                       migration 0040 enforces this pairing).
 *
 * Only the fields provided in the input are written.
 */
export interface UpdateOwnProfileInput {
  displayName?: string;
  profession?: string | null;
  professionOther?: string | null;
  notifyWeekday?: number | null;
}

export function useUpdateOwnProfile() {
  const { refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (input: UpdateOwnProfileInput): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) throw new Error('Not signed in');

      const patch: Record<string, unknown> = {};
      if (input.displayName !== undefined) {
        patch.display_name = input.displayName;
      }
      if (input.profession !== undefined) {
        patch.profession = input.profession;
      }
      if (input.professionOther !== undefined) {
        patch.profession_other = input.professionOther;
      }
      if (input.notifyWeekday !== undefined) {
        patch.notify_weekday = input.notifyWeekday;
      }
      if (Object.keys(patch).length === 0) return;

      const { error } = await supabase
        .from('profile')
        .update(patch)
        .eq('id', userResp.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void refreshProfile();
    }
  });
}
