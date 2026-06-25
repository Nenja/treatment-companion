'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import type { InjectionSide } from '@/lib/types';

export interface SubmitPhysioMuscleSuggestionInput {
  patientId: string;
  muscle: string;
  side: InjectionSide;
  rationale: string;
  /** Optional approved_goal id this muscle observation relates to. */
  relatedGoalId?: string | null;
}

/**
 * Submits one physiotherapist muscle suggestion via the
 * submit_physio_muscle_suggestion RPC. The patient's active cycle is
 * resolved server-side; the optional goal link is validated there.
 */
export function useSubmitPhysioMuscleSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: SubmitPhysioMuscleSuggestionInput
    ): Promise<string> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc(
        'submit_physio_muscle_suggestion',
        {
          p_patient_id: input.patientId,
          p_muscle: input.muscle,
          p_side: input.side,
          p_rationale: input.rationale,
          p_related_goal_id: input.relatedGoalId ?? undefined
        }
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['physioMuscleSuggestions'] });
    }
  });
}

export interface PhysioMuscleSuggestionSummary {
  id: string;
  muscle: string;
  side: InjectionSide;
  rationale: string;
  relatedGoalId: string | null;
  status: string;
  createdAt: string;
}

/**
 * Physician action on a physiotherapist muscle suggestion: 'reviewed'
 * (considered in injection planning) or 'dismissed' (not relevant).
 * Calls the set_physio_muscle_suggestion_status RPC.
 */
export function useSetPhysioMuscleSuggestionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      suggestionId: string;
      status: 'reviewed' | 'dismissed';
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc(
        'set_physio_muscle_suggestion_status',
        {
          p_suggestion_id: input.suggestionId,
          p_status: input.status
        }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['physioMuscleSuggestions'] });
      qc.invalidateQueries({ queryKey: ['clinicianPatient'] });
    }
  });
}

/**
 * Lists physiotherapist muscle suggestions for a patient in the current
 * cycle, newest first. RLS limits results to patients the caller has an
 * active unlock for.
 */
export function usePhysioMuscleSuggestions(
  patientId: string | null,
  enabled: boolean
) {
  return useQuery({
    queryKey: ['physioMuscleSuggestions', patientId],
    enabled: !!patientId && enabled,
    queryFn: async (): Promise<PhysioMuscleSuggestionSummary[]> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('physio_muscle_suggestion')
        .select(
          'id, muscle, side, rationale, related_goal_id, status, created_at'
        )
        .eq('patient_id', patientId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((s) => ({
        id: s.id as string,
        muscle: s.muscle as string,
        side: s.side as InjectionSide,
        rationale: s.rationale as string,
        relatedGoalId: (s.related_goal_id as string | null) ?? null,
        status: s.status as string,
        createdAt: s.created_at as string
      }));
    }
  });
}
