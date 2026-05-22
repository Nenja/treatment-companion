'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

export interface PhysioGoalRatingInput {
  approvedGoalId: string;
  nrsValue: number;
}

export interface SubmitPhysioAssessmentInput {
  patientId: string;
  date: string; // ISO date (yyyy-mm-dd)
  note?: string;
  ratings: PhysioGoalRatingInput[];
}

/**
 * Submits a physiotherapist assessment via the submit_physio_assessment
 * RPC: one visit (date + note) carrying per-goal NRS ratings. Goals the
 * physio skipped are simply absent from `ratings`.
 */
export function useSubmitPhysioAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: SubmitPhysioAssessmentInput
    ): Promise<string> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('submit_physio_assessment', {
        p_patient_id: input.patientId,
        p_date: input.date,
        p_note: input.note ?? null,
        p_ratings: input.ratings.map((r) => ({
          approved_goal_id: r.approvedGoalId,
          nrs_value: r.nrsValue
        }))
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['physioAssessments'] });
    }
  });
}

export interface PhysioAssessmentSummary {
  id: string;
  assessmentDate: string;
  note: string | null;
  ratings: {
    approvedGoalId: string;
    nrsValue: number;
  }[];
}

/**
 * Loads physio assessments already recorded for a patient in the
 * current cycle, newest first. Used to show the physiotherapist what
 * they (and colleagues) have logged so far. RLS limits this to
 * patients the caller has an active unlock for.
 */
export function usePhysioAssessments(
  patientId: string | null,
  enabled: boolean
) {
  return useQuery({
    queryKey: ['physioAssessments', patientId],
    enabled: !!patientId && enabled,
    queryFn: async (): Promise<PhysioAssessmentSummary[]> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('physio_assessment')
        .select(
          'id, assessment_date, note, ratings:physio_goal_rating ( approved_goal_id, nrs_value )'
        )
        .eq('patient_id', patientId!)
        .order('assessment_date', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((a) => ({
        id: a.id as string,
        assessmentDate: a.assessment_date as string,
        note: (a.note as string | null) ?? null,
        ratings: ((a.ratings as Array<{
          approved_goal_id: string;
          nrs_value: number;
        }> | null) ?? []).map((r) => ({
          approvedGoalId: r.approved_goal_id,
          nrsValue: r.nrs_value
        }))
      }));
    }
  });
}
