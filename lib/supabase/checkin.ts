'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import type { NrsConfig, NrsDirection } from '../types';

export interface CheckinGoal {
  id: string;
  patientFacingText: string;
  /** Which measurement model this goal uses. */
  kind: 'nrs' | 'gas';
  /** Present for NRS goals. */
  nrs?: NrsConfig;
  /**
   * Present for GAS goals: the descriptive anchor for each level, or
   * null where the clinician left it blank (the patient then rates
   * against the goal text itself, using the level's generic meaning).
   */
  gas?: {
    minus2: string | null;
    minus1: string | null;
    zero: string | null;
    plus1: string | null;
    plus2: string | null;
  };
  /**
   * The patient's most recent NRS rating for this goal from an earlier
   * week, if any. Shown during the check-in as a quiet "last time"
   * anchor — it makes this week's rating less abstract and more
   * consistent, and lightly reassures a patient who isn't sure whether
   * they checked in before. Null when this is the first rating of the
   * goal, or the previous check-in skipped it. (NRS goals only.)
   */
  previousRating: {
    nrsValue: number;
    weekNumber: number;
  } | null;
  /**
   * True when the clinician enabled an optional short video for this goal.
   * The recorder is only offered in the peak-effect window (weeks 6–8),
   * gated in the check-in UI.
   */
  videoEnabled: boolean;
  /**
   * Standardized task protocol (migration 0071), shown at record time so a
   * rotating informant films the same task each week. Null when not set.
   */
  videoTaskInstruction: string | null;
  videoTaskSetup: string | null;
  videoTaskSeconds: number | null;
  /**
   * True when this goal already has a video recorded earlier in the
   * current cycle. The recorder is offered at weeks 6–8 only until one
   * video exists, so there's at most one per cycle.
   */
  videoAlreadyInCycle: boolean;
  /** In-clinic baseline clip for this goal, shown as a reference when
   *  recording the peak-effect video. Null when none was recorded. */
  baselineVideoPath: string | null;
}

export interface CheckinData {
  prompt: {
    id: string;
    weekNumber: number;
  };
  /** The current patient's id — used to namespace uploaded videos in
   *  Storage (the bucket's RLS requires the path's first folder to match). */
  patientId: string;
  goals: CheckinGoal[];
}

/**
 * Loads everything the check-in page needs: the patient's pending
 * prompt (specified or oldest), plus every active approved goal with
 * its NRS configuration. Returns null if there's no pending prompt.
 */
export function useCheckinData(
  profileId: string | null,
  role: string | null | undefined,
  promptId: string | null
) {
  return useQuery({
    queryKey: ['checkin', profileId, promptId],
    enabled: !!profileId && role === 'patient',
    queryFn: async (): Promise<CheckinData | null> => {
      const supabase = createSupabaseBrowserClient();

      const { data: patientRow, error: pErr } = await supabase
        .from('patient')
        .select('id')
        .eq('profile_id', profileId!)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!patientRow) throw new Error('No patient row');

      const patientId = patientRow.id as string;

      const { data: cycleRow, error: cErr } = await supabase
        .from('treatment_cycle')
        .select('id')
        .eq('patient_id', patientId)
        .eq('status', 'active')
        .order('cycle_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!cycleRow) return null;

      const cycleId = cycleRow.id as string;

      // Targeted prompt id (from ?promptId=X) takes priority — used for
      // the catch-up flow. Otherwise pick the oldest pending prompt.
      let promptRow: { id: string; week_number: number } | null = null;
      if (promptId) {
        const { data, error } = await supabase
          .from('weekly_prompt')
          .select('id, week_number, status, treatment_cycle_id')
          .eq('id', promptId)
          .maybeSingle();
        if (error) throw error;
        if (
          data &&
          data.status === 'pending' &&
          data.treatment_cycle_id === cycleId
        ) {
          promptRow = {
            id: data.id as string,
            week_number: data.week_number as number
          };
        }
      }
      if (!promptRow) {
        const { data, error } = await supabase
          .from('weekly_prompt')
          .select('id, week_number')
          .eq('treatment_cycle_id', cycleId)
          .eq('status', 'pending')
          .order('week_number', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        promptRow = {
          id: data.id as string,
          week_number: data.week_number as number
        };
      }

      // Load active goals with their NRS configs.
      const { data: goalRows, error: gErr } = await supabase
        .from('approved_goal')
        .select('id, patient_facing_text, goal_kind, nrs_question, nrs_direction, nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high, anchor_minus2, anchor_minus1, anchor_zero, anchor_plus1, anchor_plus2, video_enabled, video_task_instruction, video_task_setup, video_task_seconds, baseline_video_path')
        .eq('treatment_cycle_id', cycleId)
        .eq('status', 'active')
        .order('approved_at', { ascending: true });
      if (gErr) throw gErr;

      const goalRowsArr = goalRows ?? [];

      // For the "last time" anchor: the most recent NRS rating each
      // goal received in an EARLIER week than the current prompt. We
      // pull all of this cycle's earlier ratings for these goals in one
      // query (joined to weekly_checkin for the week number), ordered
      // newest-first, then keep the first — i.e. most recent — per goal.
      const goalIds = goalRowsArr.map((g) => g.id as string);
      const previousByGoal = new Map<
        string,
        { nrsValue: number; weekNumber: number }
      >();
      if (goalIds.length > 0) {
        const { data: priorRows, error: prErr } = await supabase
          .from('weekly_goal_rating')
          .select(
            'approved_goal_id, nrs_value, weekly_checkin!inner(week_number, treatment_cycle_id)'
          )
          .in('approved_goal_id', goalIds)
          .not('nrs_value', 'is', null)
          .eq('weekly_checkin.treatment_cycle_id', cycleId)
          .lt('weekly_checkin.week_number', promptRow.week_number);
        if (prErr) throw prErr;
        // Keep the highest week_number (most recent) per goal. We sort
        // in JS rather than relying on ordering across the embedded
        // join, which is brittle in PostgREST.
        for (const row of priorRows ?? []) {
          const gid = row.approved_goal_id as string;
          const wc = row.weekly_checkin as unknown as {
            week_number: number;
          };
          const existing = previousByGoal.get(gid);
          if (!existing || wc.week_number > existing.weekNumber) {
            previousByGoal.set(gid, {
              nrsValue: row.nrs_value as number,
              weekNumber: wc.week_number
            });
          }
        }
      }

      // One video per cycle: which of these goals already have a video
      // recorded somewhere in this cycle. If so, we won't offer the
      // recorder again (it's shown at weeks 6–8 until one is recorded).
      const videoInCycle = new Set<string>();
      if (goalIds.length > 0) {
        const { data: vidRows, error: vErr } = await supabase
          .from('weekly_goal_rating')
          .select(
            'approved_goal_id, weekly_checkin!inner(treatment_cycle_id)'
          )
          .in('approved_goal_id', goalIds)
          .not('video_path', 'is', null)
          .eq('weekly_checkin.treatment_cycle_id', cycleId);
        if (vErr) throw vErr;
        for (const row of vidRows ?? []) {
          videoInCycle.add(row.approved_goal_id as string);
        }
      }

      const goals: CheckinGoal[] = goalRowsArr.map((g) => {
        const kind = (g.goal_kind as 'nrs' | 'gas') ?? 'nrs';
        return {
          id: g.id as string,
          patientFacingText: g.patient_facing_text as string,
          kind,
          nrs:
            kind === 'nrs'
              ? {
                  question: g.nrs_question as string,
                  direction: g.nrs_direction as NrsDirection,
                  cutLowLow: g.nrs_cut_low_low as number,
                  cutLow: g.nrs_cut_low as number,
                  cutZero: g.nrs_cut_zero as number,
                  cutHigh: g.nrs_cut_high as number
                }
              : undefined,
          gas:
            kind === 'gas'
              ? {
                  minus2: (g.anchor_minus2 as string | null) ?? null,
                  minus1: (g.anchor_minus1 as string | null) ?? null,
                  zero: (g.anchor_zero as string | null) ?? null,
                  plus1: (g.anchor_plus1 as string | null) ?? null,
                  plus2: (g.anchor_plus2 as string | null) ?? null
                }
              : undefined,
          // The "last time" anchor is NRS-only; leave null for GAS.
          previousRating:
            kind === 'nrs'
              ? previousByGoal.get(g.id as string) ?? null
              : null,
          videoEnabled: (g.video_enabled as boolean) ?? false,
          videoTaskInstruction:
            (g.video_task_instruction as string | null) ?? null,
          videoTaskSetup: (g.video_task_setup as string | null) ?? null,
          videoTaskSeconds: (g.video_task_seconds as number | null) ?? null,
          videoAlreadyInCycle: videoInCycle.has(g.id as string),
          baselineVideoPath: (g.baseline_video_path as string | null) ?? null
        };
      });

      return {
        prompt: {
          id: promptRow.id as string,
          weekNumber: promptRow.week_number as number
        },
        patientId,
        goals
      };
    }
  });
}

export interface SubmitCheckinInput {
  promptId: string;
  ratings: {
    approvedGoalId: string;
    /** Set for NRS goals (0–10). Null/omitted for GAS goals. */
    nrsValue?: number | null;
    /** Set for GAS goals (−2..2, the level picked). Null for NRS. */
    gasValue?: number | null;
    /** Storage object key of an optional recorded video for this goal,
     *  if the patient recorded one. Null/omitted otherwise. */
    videoPath?: string | null;
  }[];
  comment?: string;
  submitterLabel?: 'self' | 'caregiver';
  /** ISO weekday numbers (1=Mon..7=Sun) trained AT HOME this week.
   *  Empty array = reported none. Omitted = not reported. */
  trainingDays?: number[];
  /** ISO weekday numbers (1=Mon..7=Sun) trained WITH A THERAPIST this week. */
  trainingDaysTherapist?: number[];
}

/**
 * Uploads a recorded goal video to the private `goal-videos` bucket and
 * returns its object key. The path is namespaced by patient id (required
 * by the bucket's row-level policy) and keyed by prompt + goal, so a
 * re-recorded clip overwrites the previous one for that goal/check-in.
 */
export async function uploadGoalVideo(params: {
  patientId: string;
  promptId: string;
  goalId: string;
  blob: Blob;
  ext: string;
}): Promise<string> {
  const { patientId, promptId, goalId, blob, ext } = params;
  const supabase = createSupabaseBrowserClient();
  const path = `${patientId}/${promptId}/${goalId}.${ext}`;
  const { error } = await supabase.storage
    .from('goal-videos')
    .upload(path, blob, {
      contentType: blob.type || `video/${ext}`,
      upsert: true
    });
  if (error) throw error;
  return path;
}

/**
 * Submits a check-in via the submit_weekly_checkin_v4 RPC. The server
 * derives GAS from NRS for NRS goals, and stores the picked level
 * directly for GAS goals. A single check-in may mix both kinds. An
 * optional per-goal video path is stored only for video-enabled goals.
 */
export function useSubmitCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitCheckinInput): Promise<string> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('submit_weekly_checkin_v4', {
        p_prompt_id: input.promptId,
        p_ratings: input.ratings.map((r) => ({
          approved_goal_id: r.approvedGoalId,
          nrs_value: r.nrsValue ?? null,
          gas_value: r.gasValue ?? null,
          video_path: r.videoPath ?? null
        })),
        p_comment: input.comment ?? null,
        p_submitter_label: input.submitterLabel ?? 'self'
      });
      if (error) throw error;
      const checkinId = data as string;

      // Training days (home + with therapist) are stored on the check-in
      // via a small follow-up RPC (keeps the submit RPC stable). Best-effort:
      // the check-in is already saved, so we don't reject on failure.
      if (input.trainingDays || input.trainingDaysTherapist) {
        try {
          const { error: tdErr } = await supabase.rpc(
            'set_checkin_training_days',
            {
              p_checkin_id: checkinId,
              p_days: input.trainingDays ?? [],
              p_days_therapist: input.trainingDaysTherapist ?? []
            }
          );
          if (tdErr) console.error('set_checkin_training_days failed', tdErr);
        } catch (e) {
          console.error('set_checkin_training_days threw', e);
        }
      }

      return checkinId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patientHome'] });
      qc.invalidateQueries({ queryKey: ['checkin'] });
    }
  });
}
