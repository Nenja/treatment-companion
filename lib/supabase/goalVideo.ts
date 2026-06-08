'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

/**
 * Creates a short-lived signed URL for a goal video so the clinician can
 * play it back. The private `goal-videos` bucket already grants clinicians
 * read access to videos of patients they have an active session with
 * (migration 0062), so this works from the clinician's own session — no
 * service role needed.
 *
 * The URL is time-limited; we refetch a little before it lapses so a long
 * review session doesn't hit an expired link.
 */
const VIDEO_URL_TTL_SECONDS = 60 * 60; // 1 hour

export function useGoalVideoUrl(path: string | null) {
  return useQuery({
    queryKey: ['goalVideoUrl', path],
    enabled: !!path,
    staleTime: (VIDEO_URL_TTL_SECONDS - 300) * 1000,
    gcTime: VIDEO_URL_TTL_SECONDS * 1000,
    retry: 1,
    queryFn: async (): Promise<string> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.storage
        .from('goal-videos')
        .createSignedUrl(path as string, VIDEO_URL_TTL_SECONDS);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error('No signed URL returned');
      return data.signedUrl;
    }
  });
}

/**
 * Deletes a saved per-rating goal-video clip: removes the Storage object and
 * then clears its reference (and orphaned clinic score) on the rating. Used by
 * the clinician when a clip was recorded in error or should be removed on
 * request. A missing Storage object is tolerated so the row still clears.
 */
export function useDeleteGoalRatingVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ratingId,
      path
    }: {
      ratingId: string;
      path: string;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error: removeError } = await supabase.storage
        .from('goal-videos')
        .remove([path]);
      if (removeError) throw removeError;
      const { error } = await supabase.rpc('clear_goal_rating_video', {
        p_rating_id: ratingId
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Broad refresh: the clip disappears from the cockpit's visit strip,
      // the score queue and the clinic series, and the signed-URL cache.
      qc.invalidateQueries();
    }
  });
}
