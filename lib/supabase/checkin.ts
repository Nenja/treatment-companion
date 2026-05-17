'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import type { GasAnchors, RatingLabel } from '../types';

export interface CheckinGoal {
  id: string;
  patientFacingText: string;
  gasAnchors: GasAnchors;
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
 * prompt for the current cycle, plus every active approved goal
 * (including all five GAS anchors). Returns null if there's no
 * pending prompt — the page redirects home in that case.
 */
export function useCheckinData(profileId: string | null, role: string | null | undefined) {
  return useQuery({
    queryKey: ['checkin', profileId],
    enabled: !!profileId && role === 'patient',
    queryFn: async (): Promise<CheckinData | null> => {
      const supabase = createSupabaseBrowserClient();

      // Find the patient ID
      const { data: patientRow, error: pErr } = await supabase
        .from('patient')
        .select('id')
        .eq('profile_id', profileId!)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!patientRow) throw new Error('No patient row');

      const patientId = patientRow.id as string;

      // Find the active cycle
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

      // Find the pending prompt
      const { data: promptRow, error: prErr } = await supabase
        .from('weekly_prompt')
        .select('id, week_number')
        .eq('treatment_cycle_id', cycleId)
        .eq('status', 'pending')
        .order('week_number', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (prErr) throw prErr;
      if (!promptRow) return null;

      // Load all active goals with their anchors
      const { data: goalRows, error: gErr } = await supabase
        .from('approved_goal')
        .select(
          'id, patient_facing_text, ' +
            'anchor_minus2, anchor_minus1, anchor_zero, anchor_plus1, anchor_plus2'
        )
        .eq('treatment_cycle_id', cycleId)
        .eq('status', 'active')
        .order('approved_at', { ascending: true });
      if (gErr) throw gErr;

      const goals: CheckinGoal[] = (goalRows ?? []).map((g) => ({
        id: g.id as string,
        patientFacingText: g.patient_facing_text as string,
        gasAnchors: {
          minus2: g.anchor_minus2 as string,
          minus1: g.anchor_minus1 as string,
          zero: g.anchor_zero as string,
          plus1: g.anchor_plus1 as string,
          plus2: g.anchor_plus2 as string
        }
      }));

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
    ratingLabel: RatingLabel;
    ratingValue: -2 | -1 | 0 | 1 | 2 | null;
  }[];
  comment?: string;
}

/**
 * Submits a complete check-in via the submit_weekly_checkin RPC.
 * Atomic on the server side — all or nothing.
 * On success, invalidates the patientHome and checkin caches so the
 * UI refetches fresh state.
 */
export function useSubmitCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitCheckinInput): Promise<string> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('submit_weekly_checkin', {
        p_prompt_id: input.promptId,
        p_ratings: input.ratings.map((r) => ({
          approved_goal_id: r.approvedGoalId,
          rating_label: r.ratingLabel,
          rating_value: r.ratingValue
        })),
        p_comment: input.comment ?? null
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
