'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import type { NrsConfig, NrsDirection } from '../types';

export interface ClinicianPatientGoal {
  id: string;
  patientFacingText: string;
  smartText: string;
  nrs: NrsConfig;
}

export interface ClinicianPatientSuggestion {
  id: string;
  domain: string;
  patientWording: string;
  importance: string;
  hopedTimeframe: string;
  difficultyContext: string | null;
  createdAt: string;
}

export interface ClinicianPatientCheckin {
  id: string;
  weekNumber: number;
  comment: string | null;
  submitterLabel: 'self' | 'caregiver';
  ratings: {
    approvedGoalId: string;
    ratingValue: number | null;
    nrsValue: number | null;
  }[];
}

export interface ClinicianTreatmentRecord {
  id: string;
  date: string;
  drugProduct: string;
  totalUnits: number;
  dilution: string | null;
  guidance: string;
  notes: string | null;
  injections: {
    id: string;
    muscle: string;
    side: 'left' | 'right' | 'bilateral';
    doseUnits: number;
    note: string | null;
    position: number;
  }[];
}

export interface ClinicianPhysioAssessment {
  id: string;
  assessmentDate: string;
  note: string | null;
  ratings: {
    approvedGoalId: string;
    nrsValue: number;
  }[];
}

export interface ClinicianPhysioGoalSuggestion {
  id: string;
  suggestedGoal: string;
  rationale: string;
  status: string;
  createdAt: string;
}

export interface ClinicianPhysioMuscleSuggestion {
  id: string;
  muscle: string;
  side: 'left' | 'right' | 'bilateral';
  rationale: string;
  relatedGoalId: string | null;
  status: string;
  createdAt: string;
}

export interface ClinicianPatientData {
  patient: {
    id: string;
    displayName: string;
  };
  cycle: {
    id: string;
    cycleNumber: number;
    startDate: string;
  };
  suggestions: ClinicianPatientSuggestion[];
  activeGoals: ClinicianPatientGoal[];
  checkins: ClinicianPatientCheckin[];
  treatment: ClinicianTreatmentRecord | null;
  physioAssessments: ClinicianPhysioAssessment[];
  physioGoalSuggestions: ClinicianPhysioGoalSuggestion[];
  physioMuscleSuggestions: ClinicianPhysioMuscleSuggestion[];
}

/**
 * Loads everything the clinician's patient view needs. Driven by the
 * clinician's active session — the function fetches the session row
 * first to discover which patient to load, then runs parallel queries
 * for the rest.
 */
export function useClinicianPatientData(
  profileId: string | null,
  role: string | null | undefined,
  patientId: string | null
) {
  return useQuery({
    queryKey: ['clinicianPatient', patientId],
    enabled: !!profileId && role === 'clinician' && !!patientId,
    queryFn: async (): Promise<ClinicianPatientData | null> => {
      const supabase = createSupabaseBrowserClient();

      // 1. Patient + display_name
      const { data: pRow, error: pErr } = await supabase
        .from('patient')
        .select('id, profile:profile_id (display_name)')
        .eq('id', patientId!)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!pRow) return null;

      const patient = {
        id: pRow.id as string,
        displayName:
          (Array.isArray(pRow.profile)
            ? pRow.profile[0]?.display_name
            : (pRow.profile as { display_name?: string } | null)?.display_name) ??
          'Patient'
      };

      // 2. Active cycle
      const { data: cycleRow, error: cErr } = await supabase
        .from('treatment_cycle')
        .select('id, cycle_number, start_date')
        .eq('patient_id', patient.id)
        .eq('status', 'active')
        .order('cycle_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!cycleRow) return null;

      const cycle = {
        id: cycleRow.id as string,
        cycleNumber: cycleRow.cycle_number as number,
        startDate: cycleRow.start_date as string
      };

      // 3. Parallel queries for the rest
      const [
        suggestionsRes,
        goalsRes,
        checkinsRes,
        treatmentRes,
        physioRes,
        physioSuggRes,
        physioMuscleRes
      ] = await Promise.all([
          supabase
            .from('goal_suggestion')
            .select(
              'id, domain, patient_wording, importance, hoped_timeframe, difficulty_context, status, created_at'
            )
            .eq('treatment_cycle_id', cycle.id)
            .eq('status', 'needsReview')
            .order('created_at', { ascending: true }),
          supabase
            .from('approved_goal')
            .select(
              'id, patient_facing_text, smart_text, nrs_question, nrs_direction, nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high'
            )
            .eq('treatment_cycle_id', cycle.id)
            .eq('status', 'active')
            .order('approved_at', { ascending: true }),
          supabase
            .from('weekly_checkin')
            .select(
              'id, week_number, comment, submitter_label, ratings:weekly_goal_rating (approved_goal_id, rating_value, nrs_value)'
            )
            .eq('treatment_cycle_id', cycle.id)
            .order('week_number', { ascending: true }),
          supabase
            .from('treatment_session')
            .select(
              'id, date, drug_product, total_units, dilution, guidance, notes, injections:muscle_injection (id, muscle, side, dose_units, note, position)'
            )
            .eq('treatment_cycle_id', cycle.id)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('physio_assessment')
            .select(
              'id, assessment_date, note, ratings:physio_goal_rating (approved_goal_id, nrs_value)'
            )
            .eq('treatment_cycle_id', cycle.id)
            .order('assessment_date', { ascending: true }),
          supabase
            .from('physio_goal_suggestion')
            .select('id, suggested_goal, rationale, status, created_at')
            .eq('treatment_cycle_id', cycle.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('physio_muscle_suggestion')
            .select(
              'id, muscle, side, rationale, related_goal_id, status, created_at'
            )
            .eq('treatment_cycle_id', cycle.id)
            .order('created_at', { ascending: true })
        ]);

      if (suggestionsRes.error) throw suggestionsRes.error;
      if (goalsRes.error) throw goalsRes.error;
      if (checkinsRes.error) throw checkinsRes.error;
      if (treatmentRes.error) throw treatmentRes.error;
      if (physioRes.error) throw physioRes.error;
      if (physioSuggRes.error) throw physioSuggRes.error;
      if (physioMuscleRes.error) throw physioMuscleRes.error;

      const suggestions: ClinicianPatientSuggestion[] = (
        suggestionsRes.data ?? []
      ).map((s) => ({
        id: s.id as string,
        domain: s.domain as string,
        patientWording: s.patient_wording as string,
        importance: s.importance as string,
        hopedTimeframe: s.hoped_timeframe as string,
        difficultyContext: (s.difficulty_context as string | null) ?? null,
        createdAt: s.created_at as string
      }));

      const activeGoals: ClinicianPatientGoal[] = (goalsRes.data ?? []).map(
        (g) => ({
          id: g.id as string,
          patientFacingText: g.patient_facing_text as string,
          smartText: g.smart_text as string,
          nrs: {
            question: g.nrs_question as string,
            direction: g.nrs_direction as NrsDirection,
            cutLowLow: g.nrs_cut_low_low as number,
            cutLow: g.nrs_cut_low as number,
            cutZero: g.nrs_cut_zero as number,
            cutHigh: g.nrs_cut_high as number
          }
        })
      );

      const checkins: ClinicianPatientCheckin[] = (checkinsRes.data ?? []).map(
        (c) => ({
          id: c.id as string,
          weekNumber: c.week_number as number,
          comment: (c.comment as string | null) ?? null,
          submitterLabel: (c.submitter_label as 'self' | 'caregiver') ?? 'self',
          ratings: (c.ratings as Array<{
            approved_goal_id: string;
            rating_value: number | null;
            nrs_value: number | null;
          }> | null ?? []).map((r) => ({
            approvedGoalId: r.approved_goal_id,
            ratingValue: r.rating_value,
            nrsValue: r.nrs_value
          }))
        })
      );

      const treatment: ClinicianTreatmentRecord | null = treatmentRes.data
        ? {
            id: treatmentRes.data.id as string,
            date: treatmentRes.data.date as string,
            drugProduct: treatmentRes.data.drug_product as string,
            totalUnits: Number(treatmentRes.data.total_units),
            dilution: (treatmentRes.data.dilution as string | null) ?? null,
            guidance: treatmentRes.data.guidance as string,
            notes: (treatmentRes.data.notes as string | null) ?? null,
            injections: (
              treatmentRes.data.injections as Array<{
                id: string;
                muscle: string;
                side: 'left' | 'right' | 'bilateral';
                dose_units: number;
                note: string | null;
                position: number;
              }> | null ?? []
            )
              .map((i) => ({
                id: i.id,
                muscle: i.muscle,
                side: i.side,
                doseUnits: Number(i.dose_units),
                note: i.note,
                position: i.position
              }))
              .sort((a, b) => a.position - b.position)
          }
        : null;

      const physioAssessments: ClinicianPhysioAssessment[] = (
        physioRes.data ?? []
      ).map((a) => ({
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

      const physioGoalSuggestions: ClinicianPhysioGoalSuggestion[] = (
        physioSuggRes.data ?? []
      ).map((s) => ({
        id: s.id as string,
        suggestedGoal: s.suggested_goal as string,
        rationale: s.rationale as string,
        status: s.status as string,
        createdAt: s.created_at as string
      }));

      const physioMuscleSuggestions: ClinicianPhysioMuscleSuggestion[] = (
        physioMuscleRes.data ?? []
      ).map((s) => ({
        id: s.id as string,
        muscle: s.muscle as string,
        side: s.side as 'left' | 'right' | 'bilateral',
        rationale: s.rationale as string,
        relatedGoalId: (s.related_goal_id as string | null) ?? null,
        status: s.status as string,
        createdAt: s.created_at as string
      }));

      return {
        patient,
        cycle,
        suggestions,
        activeGoals,
        checkins,
        treatment,
        physioAssessments,
        physioGoalSuggestions,
        physioMuscleSuggestions
      };
    }
  });
}

// ---------------------------------------------------------------------------
// Mutations called from the clinician patient view + suggestion review.
// ---------------------------------------------------------------------------

export interface ApproveSuggestionInput {
  suggestionId: string;
  patientFacingText: string;
  smartText: string;
  nrsQuestion: string;
  nrsDirection: NrsDirection;
  cutLowLow: number;
  cutLow: number;
  cutZero: number;
  cutHigh: number;
}

/**
 * Input for create_goal_for_patient — a physician recording a goal the
 * patient voiced in clinic. Same fields as ApproveSuggestionInput but
 * keyed by patientId instead of an existing suggestionId.
 */
export interface CreateGoalForPatientInput {
  patientId: string;
  patientFacingText: string;
  smartText: string;
  nrsQuestion: string;
  nrsDirection: NrsDirection;
  cutLowLow: number;
  cutLow: number;
  cutZero: number;
  cutHigh: number;
}

/**
 * Physician records + approves a goal on the patient's behalf in one
 * step. The goal still originates from the patient (they voiced it in
 * clinic); the physician is the scribe. No goal_suggestion row is
 * involved — the RPC inserts the approved_goal with a null suggestion.
 */
export function useCreateGoalForPatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: CreateGoalForPatientInput
    ): Promise<string> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc(
        'create_goal_for_patient',
        {
          p_patient_id: input.patientId,
          p_patient_facing_text: input.patientFacingText,
          p_smart_text: input.smartText,
          p_nrs_question: input.nrsQuestion,
          p_nrs_direction: input.nrsDirection,
          p_nrs_cut_low_low: input.cutLowLow,
          p_nrs_cut_low: input.cutLow,
          p_nrs_cut_zero: input.cutZero,
          p_nrs_cut_high: input.cutHigh
        }
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinicianPatient'] });
    }
  });
}

export function useApproveSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApproveSuggestionInput): Promise<string> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('approve_suggestion', {
        p_suggestion_id: input.suggestionId,
        p_patient_facing_text: input.patientFacingText,
        p_smart_text: input.smartText,
        p_nrs_question: input.nrsQuestion,
        p_nrs_direction: input.nrsDirection,
        p_nrs_cut_low_low: input.cutLowLow,
        p_nrs_cut_low: input.cutLow,
        p_nrs_cut_zero: input.cutZero,
        p_nrs_cut_high: input.cutHigh
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinicianPatient'] });
    }
  });
}

export function useSetSuggestionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      suggestionId: string;
      status:
        | 'discussAtNextVisit'
        | 'combinedWithAnother'
        | 'notSuitableThisCycle'
        | 'archived';
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('set_suggestion_status', {
        p_suggestion_id: input.suggestionId,
        p_status: input.status
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinicianPatient'] });
    }
  });
}

export interface SaveTreatmentSessionInput {
  treatmentCycleId: string;
  date: string;
  drugProduct: string;
  totalUnits: number;
  dilution?: string;
  guidance: string;
  notes?: string;
  injections: {
    muscle: string;
    side: 'left' | 'right' | 'bilateral';
    doseUnits: number;
    note?: string;
  }[];
}

export function useSaveTreatmentSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: SaveTreatmentSessionInput
    ): Promise<string> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('save_treatment_session', {
        p_treatment_cycle_id: input.treatmentCycleId,
        p_date: input.date,
        p_drug_product: input.drugProduct,
        p_total_units: input.totalUnits,
        p_dilution: input.dilution ?? null,
        p_guidance: input.guidance,
        p_notes: input.notes ?? null,
        p_injections: input.injections.map((i) => ({
          muscle: i.muscle,
          side: i.side,
          dose_units: i.doseUnits,
          note: i.note ?? null
        }))
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinicianPatient'] });
    }
  });
}

/**
 * Loads the most recent treatment session from a PREVIOUS cycle for
 * this patient — the "previous" being any cycle with cycle_number less
 * than the current. Used by "Copy from previous treatment".
 *
 * Returns null when there's no prior cycle (e.g. this is the patient's
 * first cycle).
 */
export function usePreviousTreatment(
  patientId: string | null,
  currentCycleNumber: number | null,
  enabled: boolean
) {
  return useQuery({
    queryKey: ['previousTreatment', patientId, currentCycleNumber],
    enabled:
      enabled && !!patientId && typeof currentCycleNumber === 'number',
    queryFn: async (): Promise<ClinicianTreatmentRecord | null> => {
      const supabase = createSupabaseBrowserClient();
      // Find any past cycle (cycle_number < current). Their treatment
      // sessions ordered by date desc.
      const { data: prevCycles, error: cErr } = await supabase
        .from('treatment_cycle')
        .select('id, cycle_number')
        .eq('patient_id', patientId!)
        .lt('cycle_number', currentCycleNumber!)
        .order('cycle_number', { ascending: false });
      if (cErr) throw cErr;
      if (!prevCycles || prevCycles.length === 0) return null;

      const prevCycleIds = prevCycles.map((c) => c.id as string);
      const { data: sessions, error: sErr } = await supabase
        .from('treatment_session')
        .select(
          'id, date, drug_product, total_units, dilution, guidance, notes, injections:muscle_injection (id, muscle, side, dose_units, note, position)'
        )
        .in('treatment_cycle_id', prevCycleIds)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!sessions) return null;

      return {
        id: sessions.id as string,
        date: sessions.date as string,
        drugProduct: sessions.drug_product as string,
        totalUnits: Number(sessions.total_units),
        dilution: (sessions.dilution as string | null) ?? null,
        guidance: sessions.guidance as string,
        notes: (sessions.notes as string | null) ?? null,
        injections: (
          sessions.injections as Array<{
            id: string;
            muscle: string;
            side: 'left' | 'right' | 'bilateral';
            dose_units: number;
            note: string | null;
            position: number;
          }> | null ?? []
        )
          .map((i) => ({
            id: i.id,
            muscle: i.muscle,
            side: i.side,
            doseUnits: Number(i.dose_units),
            note: i.note,
            position: i.position
          }))
          .sort((a, b) => a.position - b.position)
      };
    }
  });
}

/**
 * Starts a new treatment cycle: closes the current active cycle and
 * opens a new one with the given treatment date. The new cycle gets
 * 16 pending weekly prompts seeded. The previous cycle's goals stay
 * with the previous cycle (they're not copied forward — that's a
 * future workflow if needed).
 *
 * Returns the new cycle id so the caller can navigate to the treatment
 * record form for it.
 */
export function useStartNewCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      patientId: string;
      treatmentDate: string;
    }): Promise<string> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('start_new_cycle', {
        p_patient_id: input.patientId,
        p_treatment_date: input.treatmentDate
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinicianPatient'] });
      qc.invalidateQueries({ queryKey: ['previousTreatment'] });
    }
  });
}
