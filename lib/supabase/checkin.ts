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
}

export interface CheckinData {
  prompt: {
    id: string;
    weekNumber: number;
  };
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
        .select('id, patient_facing_text, goal_kind, nrs_question, nrs_direction, nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high, anchor_minus2, anchor_minus1, anchor_zero, anchor_plus1, anchor_plus2')
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
              : null
        };
      });

      return {
        prompt: {
          id: promptRow.id as string,
          weekNumber: promptRow.week_number as number
        },
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
  }[];
  comment?: string;
  submitterLabel?: 'self' | 'caregiver';
}

/**
 * Submits a check-in via the submit_weekly_checkin_v3 RPC. The server
 * derives GAS from NRS for NRS goals, and stores the picked level
 * directly for GAS goals. A single check-in may mix both kinds.
 */
export function useSubmitCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitCheckinInput): Promise<string> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('submit_weekly_checkin_v3', {
        p_prompt_id: input.promptId,
        p_ratings: input.ratings.map((r) => ({
          approved_goal_id: r.approvedGoalId,
          nrs_value: r.nrsValue ?? null,
          gas_value: r.gasValue ?? null
        })),
        p_comment: input.comment ?? null,
        p_submitter_label: input.submitterLabel ?? 'self'
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patientHome'] });
      qc.invalidateQueries({ queryKey: ['checkin'] });
    }
  });
}
