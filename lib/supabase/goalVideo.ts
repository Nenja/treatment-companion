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

/**
 * Deletes a goal's baseline clip: removes the Storage object, then clears the
 * goal's baseline_video_path (set_goal_baseline_video with '' resolves to NULL
 * via the RPC's nullif). Storage removal is allowed by the clinician DELETE
 * policy from migration 0089; no new migration is needed. A missing object is
 * tolerated so the reference still clears.
 */
export function useDeleteGoalBaselineVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      goalId,
      path
    }: {
      goalId: string;
      path: string;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error: removeError } = await supabase.storage
        .from('goal-videos')
        .remove([path]);
      if (removeError) throw removeError;
      const { error } = await supabase.rpc('set_goal_baseline_video', {
        p_goal_id: goalId,
        p_path: ''
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
    }
  });
}

/** A clip moved to the per-patient archive (migration 0092). */
export interface ArchivedGoalVideo {
  id: string;
  source: 'rating' | 'baseline';
  approvedGoalId: string;
  goalText: string;
  ratingId: string | null;
  videoPath: string;
  clinicRating: number | null;
  clinicUnusable: boolean;
  nrsValue: number | null;
  consentClinical: boolean;
  consentEducational: boolean;
  note: string | null;
  archivedAt: string;
}

/** Lists a patient's archived clips, newest first, with the goal's text. */
export function useArchivedVideos(patientId: string | null) {
  return useQuery({
    queryKey: ['archivedVideos', patientId],
    enabled: !!patientId,
    queryFn: async (): Promise<ArchivedGoalVideo[]> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('archived_goal_video')
        .select(
          'id, source, approved_goal_id, rating_id, video_path, clinic_video_rating, clinic_video_unusable, nrs_value, consent_clinical, consent_educational, note, archived_at, approved_goal:approved_goal_id (patient_facing_text)'
        )
        .eq('patient_id', patientId as string)
        .order('archived_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r): ArchivedGoalVideo => {
        const row = r as Record<string, unknown>;
        const goal = row.approved_goal as { patient_facing_text?: string } | null;
        return {
          id: row.id as string,
          source: row.source as 'rating' | 'baseline',
          approvedGoalId: row.approved_goal_id as string,
          goalText: goal?.patient_facing_text ?? '',
          ratingId: (row.rating_id as string | null) ?? null,
          videoPath: row.video_path as string,
          clinicRating: (row.clinic_video_rating as number | null) ?? null,
          clinicUnusable: (row.clinic_video_unusable as boolean | null) ?? false,
          nrsValue: (row.nrs_value as number | null) ?? null,
          consentClinical: (row.consent_clinical as boolean | null) ?? false,
          consentEducational: (row.consent_educational as boolean | null) ?? false,
          note: (row.note as string | null) ?? null,
          archivedAt: row.archived_at as string
        };
      });
    }
  });
}

/** Archives a clip (rating or baseline): keeps the file, snapshots score +
 *  consent, clears the active reference. Requires clinical consent (enforced
 *  server-side, migration 0092). */
export function useArchiveGoalVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      approvedGoalId: string;
      source: 'rating' | 'baseline';
      ratingId?: string | null;
      note?: string | null;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('archive_goal_video', {
        p_approved_goal_id: input.approvedGoalId,
        p_source: input.source,
        p_rating_id: (input.ratingId ?? null) as string,
        p_note: (input.note ?? null) as string
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
    }
  });
}

/** Restores an archived clip to its rating/goal and removes the archive row. */
export function useUnarchiveGoalVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (archiveId: string): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('unarchive_goal_video', {
        p_archive_id: archiveId
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
    }
  });
}

/** Permanently deletes an archived clip: removes the Storage object then the
 *  archive row (clinician DELETE policies from 0089 + 0092). */
export function useDeleteArchivedVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      archiveId: string;
      path: string;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error: removeError } = await supabase.storage
        .from('goal-videos')
        .remove([input.path]);
      if (removeError) throw removeError;
      const { error } = await supabase
        .from('archived_goal_video')
        .delete()
        .eq('id', input.archiveId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
    }
  });
}
