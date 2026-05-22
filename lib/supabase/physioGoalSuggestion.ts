'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

export interface SubmitPhysioGoalSuggestionInput {
  patientId: string;
  suggestedGoal: string;
  rationale: string;
}

/**
 * Submits one physiotherapist goal suggestion via the
 * submit_physio_goal_suggestion RPC. The patient's active cycle is
 * resolved server-side.
 */
export function useSubmitPhysioGoalSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: SubmitPhysioGoalSuggestionInput
    ): Promise<string> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc(
        'submit_physio_goal_suggestion',
        {
          p_patient_id: input.patientId,
          p_suggested_goal: input.suggestedGoal,
          p_rationale: input.rationale
        }
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['physioGoalSuggestions'] });
    }
  });
}

export interface PhysioGoalSuggestionSummary {
  id: string;
  suggestedGoal: string;
  rationale: string;
  status: string;
  createdAt: string;
}

/**
 * Lists physiotherapist goal suggestions already recorded for a patient
 * in the current cycle, newest first. RLS limits results to patients
 * the caller has an active unlock for.
 */
export function usePhysioGoalSuggestions(
  patientId: string | null,
  enabled: boolean
) {
  return useQuery({
    queryKey: ['physioGoalSuggestions', patientId],
    enabled: !!patientId && enabled,
    queryFn: async (): Promise<PhysioGoalSuggestionSummary[]> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('physio_goal_suggestion')
        .select('id, suggested_goal, rationale, status, created_at')
        .eq('patient_id', patientId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((s) => ({
        id: s.id as string,
        suggestedGoal: s.suggested_goal as string,
        rationale: s.rationale as string,
        status: s.status as string,
        createdAt: s.created_at as string
      }));
    }
  });
}
