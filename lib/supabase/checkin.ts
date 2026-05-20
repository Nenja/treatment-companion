'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import type { NrsConfig, NrsDirection } from '../types';

export interface CheckinGoal {
  id: string;
  patientFacingText: string;
  nrs: NrsConfig;
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
        .select('id, patient_facing_text, nrs_question, nrs_direction, nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high')
        .eq('treatment_cycle_id', cycleId)
        .eq('status', 'active')
        .order('approved_at', { ascending: true });
      if (gErr) throw gErr;

      const goals: CheckinGoal[] = (goalRows ?? []).map((g) => ({
        id: g.id as string,
        patientFacingText: g.patient_facing_text as string,
        nrs: {
          question: g.nrs_question as string,
          direction: g.nrs_direction as NrsDirection,
          cutLowLow: g.nrs_cut_low_low as number,
          cutLow: g.nrs_cut_low as number,
          cutZero: g.nrs_cut_zero as number,
          cutHigh: g.nrs_cut_high as number
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
    nrsValue: number;
  }[];
  comment?: string;
}

/**
 * Submits a check-in via the submit_weekly_checkin RPC. Server-side
 * computes GAS from NRS for each rating.
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
          nrs_value: r.nrsValue
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
