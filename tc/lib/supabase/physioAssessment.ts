'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

export interface PhysioGoalRatingInput {
  approvedGoalId: string;
  /** NRS 0–10 for NRS goals, or null (GAS goal / flag-only row). */
  nrsValue: number | null;
  /** GAS level −2..+2 for GAS goals, or null (NRS goal / flag-only row). */
  gasValue?: number | null;
  /** The therapist is working on this function/goal in their sessions. */
  workingOn?: boolean;
  /** Asking the physician to consider adjusting treatment for feasibility. */
  needsAdjustment?: boolean;
  /** Short reason for the adjustment request. */
  adjustmentNote?: string | null;
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
        p_note: (input.note ?? null) as string,
        p_ratings: input.ratings.map((r) => ({
          approved_goal_id: r.approvedGoalId,
          nrs_value: r.nrsValue,
          gas_value: r.gasValue ?? null,
          working_on: r.workingOn ?? false,
          needs_adjustment: r.needsAdjustment ?? false,
          adjustment_note: r.adjustmentNote ?? null
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

/**
 * Resolves a therapist adjustment request (clinician-only): marks the
 * physio_goal_rating's adjustment as 'addressed' or 'dismissed' via the
 * resolve_adjustment_request RPC, then refetches so it drops off the
 * clinician's open list. Option (A): the therapist is not shown the outcome.
 */
export function useResolveAdjustmentRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      ratingId: string;
      status: 'addressed' | 'dismissed';
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('resolve_adjustment_request', {
        p_rating_id: input.ratingId,
        p_status: input.status
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['physioAssessments'] });
      qc.invalidateQueries({ queryKey: ['clinicianPatient'] });
    }
  });
}

export interface PhysioAssessmentSummary {
  id: string;
  assessmentDate: string;
  note: string | null;
  ratings: {
    id: string;
    approvedGoalId: string;
    nrsValue: number | null;
    gasValue: number | null;
    workingOn: boolean;
    needsAdjustment: boolean;
    adjustmentNote: string | null;
    adjustmentStatus: 'open' | 'addressed' | 'dismissed';
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
          'id, assessment_date, note, ratings:physio_goal_rating ( id, approved_goal_id, nrs_value, gas_value, working_on, needs_adjustment, adjustment_note, adjustment_status )'
        )
        .eq('patient_id', patientId!)
        .order('assessment_date', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((a) => ({
        id: a.id as string,
        assessmentDate: a.assessment_date as string,
        note: (a.note as string | null) ?? null,
        ratings: ((a.ratings as Array<{
          id: string;
          approved_goal_id: string;
          nrs_value: number | null;
          gas_value: number | null;
          working_on: boolean | null;
          needs_adjustment: boolean | null;
          adjustment_note: string | null;
          adjustment_status: string | null;
        }> | null) ?? []).map((r) => ({
          id: r.id,
          approvedGoalId: r.approved_goal_id,
          nrsValue: r.nrs_value,
          gasValue: r.gas_value,
          workingOn: !!r.working_on,
          needsAdjustment: !!r.needs_adjustment,
          adjustmentNote: r.adjustment_note ?? null,
          adjustmentStatus: (r.adjustment_status ?? 'open') as
            | 'open'
            | 'addressed'
            | 'dismissed'
        }))
      }));
    }
  });
}
