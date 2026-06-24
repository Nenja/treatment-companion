'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

export interface PhysioPatientData {
  patient: {
    id: string;
    displayName: string;
    exercisePlan: string | null;
    assistiveDevices: string | null;
  };
  cycle: {
    id: string;
    cycleNumber: number;
    startDate: string;
  } | null;
  goals: {
    id: string;
    patientFacingText: string;
    /** Which graph this goal uses. */
    kind: 'nrs' | 'gas';
    /** NRS question + direction, needed to render the rating picker. */
    nrsQuestion: string;
    nrsDirection: 'higherIsBetter' | 'lowerIsBetter';
    /** Cut points for converting NRS → GAS (-2..+2). Needed to render
     *  the per-goal progress chart. */
    cutLowLow: number;
    cutLow: number;
    cutZero: number;
    cutHigh: number;
    /** GAS anchor sentences for GAS goals (null for NRS goals). */
    gas: {
      minus2: string | null;
      minus1: string | null;
      zero: string | null;
      plus1: string | null;
      plus2: string | null;
    } | null;
  }[];
  /**
   * Patient self-reported weekly check-ins for the active cycle, used
   * to draw the per-goal progress chart. RLS lets the therapist read
   * these because they have an active clinician_session for this
   * patient (the same path the clinician uses).
   */
  checkins: {
    id: string;
    weekNumber: number;
    submittedAt: string;
    comment: string | null;
    submitterLabel?: 'self' | 'caregiver';
    ratings: {
      approvedGoalId: string;
      ratingValue: -2 | -1 | 0 | 1 | 2 | null;
      nrsValue: number | null;
    }[];
  }[];
  /**
   * The patient's most recent treatment session — date plus the
   * muscles injected — so the physiotherapist knows what was treated
   * when planning exercise work. Read-only; doses are deliberately
   * omitted (the physiotherapist needs to know which muscles and
   * sides, not the physician's dosing detail). Null when the patient
   * has had no treatment recorded yet.
   */
  latestTreatment: {
    date: string;
    muscles: { muscle: string; side: 'left' | 'right' | 'bilateral' }[];
  } | null;
  /**
   * The treating physician's handoff note for THIS cycle — the one
   * clinic → therapist channel. Shown to the therapist regardless of the
   * muscle-sharing preference (it's an intentional message, not injection
   * detail), and never visible to the patient (no patient RLS policy on
   * treatment_handoff). `treatmentChanged`: true = adjusted this visit,
   * false = no change, null = the physician didn't say. Null when none set.
   */
  handoff: {
    treatmentDate: string | null;
    note: string | null;
    treatmentChanged: boolean | null;
  } | null;
  /**
   * Past assessments by this therapist (and others) for the patient's
   * active cycle, oldest first. Empty array when none yet. Used by the
   * "history" panel on the therapist page.
   */
  assessments: {
    id: string;
    assessmentDate: string;
    note: string | null;
    ratings: {
      approvedGoalId: string;
      nrsValue: number | null;
      gasValue: number | null;
    }[];
  }[];
}

/**
 * Loads the patient a physiotherapist currently has unlocked, plus
 * their active goals. Read-only — slice 1 placeholder. The patient is
 * discovered from the physiotherapist's active clinician_session
 * (RLS only returns rows the caller's session grants access to, so a
 * plain select on patient returns exactly the unlocked patient).
 *
 * Later slices add progress reporting and suggestion entry; this hook
 * will grow or be supplemented then.
 */
export function usePhysioPatientData(
  profileId: string | null,
  role: string | null | undefined
) {
  return useQuery({
    queryKey: ['physioPatient', profileId],
    enabled: !!profileId && role === 'physiotherapist',
    queryFn: async (): Promise<PhysioPatientData | null> => {
      const supabase = createSupabaseBrowserClient();

      // RLS: patient_clinician_read returns only patients the caller
      // has an active session for. With a single active unlock there's
      // exactly one such patient.
      const { data: patientRow, error: pErr } = await supabase
        .from('patient')
        .select(
          'id, profile_id, share_muscles_with_physio, physio_exercise_plan, physio_assistive_devices'
        )
        .limit(1)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!patientRow) return null;

      const patientId = patientRow.id as string;
      const shareMuscles =
        (patientRow.share_muscles_with_physio as boolean) ?? true;

      // Patient display name from their profile.
      const { data: profileRow, error: prErr } = await supabase
        .from('profile')
        .select('display_name')
        .eq('id', patientRow.profile_id as string)
        .maybeSingle();
      if (prErr) throw prErr;

      // Active cycle.
      const { data: cycleRow, error: cErr } = await supabase
        .from('treatment_cycle')
        .select('id, cycle_number, start_date')
        .eq('patient_id', patientId)
        .eq('status', 'active')
        .order('cycle_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cErr) throw cErr;

      let goals: PhysioPatientData['goals'] = [];
      let checkins: PhysioPatientData['checkins'] = [];
      if (cycleRow) {
        const { data: goalRows, error: gErr } = await supabase
          .from('approved_goal')
          .select(
            'id, patient_facing_text, goal_kind, nrs_question, nrs_direction, nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high, anchor_minus2, anchor_minus1, anchor_zero, anchor_plus1, anchor_plus2'
          )
          .eq('treatment_cycle_id', cycleRow.id as string)
          .eq('status', 'active')
          .is('superseded_at', null)
          .order('approved_at', { ascending: true });
        if (gErr) throw gErr;
        goals = (goalRows ?? []).map((g) => ({
          id: g.id as string,
          patientFacingText: g.patient_facing_text as string,
          kind: (g.goal_kind as 'nrs' | 'gas') ?? 'nrs',
          nrsQuestion: (g.nrs_question as string) ?? '',
          nrsDirection:
            (g.nrs_direction as 'higherIsBetter' | 'lowerIsBetter') ??
            'higherIsBetter',
          cutLowLow: g.nrs_cut_low_low as number,
          cutLow: g.nrs_cut_low as number,
          cutZero: g.nrs_cut_zero as number,
          cutHigh: g.nrs_cut_high as number,
          gas:
            (g.goal_kind as string) === 'gas'
              ? {
                  minus2: (g.anchor_minus2 as string | null) ?? null,
                  minus1: (g.anchor_minus1 as string | null) ?? null,
                  zero: (g.anchor_zero as string | null) ?? null,
                  plus1: (g.anchor_plus1 as string | null) ?? null,
                  plus2: (g.anchor_plus2 as string | null) ?? null
                }
              : null
        }));

        // Patient self-reports for this cycle. RLS permits the read
        // because the therapist has an active clinician_session.
        const { data: checkinRows, error: ckErr } = await supabase
          .from('weekly_checkin')
          .select(
            'id, week_number, submitted_at, comment, submitter_label, ratings:weekly_goal_rating (approved_goal_id, rating_value, nrs_value)'
          )
          .eq('treatment_cycle_id', cycleRow.id as string)
          .order('week_number', { ascending: true });
        if (ckErr) throw ckErr;
        checkins = (checkinRows ?? []).map((c) => ({
          id: c.id as string,
          weekNumber: c.week_number as number,
          submittedAt: c.submitted_at as string,
          comment: (c.comment as string | null) ?? null,
          submitterLabel:
            (c.submitter_label as 'self' | 'caregiver' | undefined) ??
            undefined,
          ratings: ((c.ratings as Array<{
            approved_goal_id: string;
            rating_value: number | null;
            nrs_value: number | null;
          }> | null) ?? []).map((r) => ({
            approvedGoalId: r.approved_goal_id,
            ratingValue: r.rating_value as -2 | -1 | 0 | 1 | 2 | null,
            nrsValue: r.nrs_value
          }))
        }));
      }

      // Most recent treatment session for this patient, with the
      // muscles injected — but only if the physician has left muscle
      // sharing on for this patient. When off, we don't fetch it at
      // all and the physiotherapist sees no "muscles treated" section.
      // This is a UI preference, not a security boundary — RLS still
      // permits the read; the physician is choosing what to surface.
      let latestTreatment: PhysioPatientData['latestTreatment'] = null;
      if (shareMuscles) {
        const { data: tsRow, error: tsErr } = await supabase
          .from('treatment_session')
          .select(
            'id, date, injections:muscle_injection (muscle, side, position)'
          )
          .eq('patient_id', patientId)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (tsErr) throw tsErr;

        if (tsRow) {
          const injections = (tsRow.injections as Array<{
            muscle: string;
            side: 'left' | 'right' | 'bilateral';
            position: number;
          }> | null) ?? [];
          latestTreatment = {
            date: tsRow.date as string,
            muscles: injections
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((m) => ({ muscle: m.muscle, side: m.side }))
          };
        }
      }

      // Past assessments for this cycle, oldest first. Empty when no
      // cycle or no assessments yet.
      let assessments: PhysioPatientData['assessments'] = [];
      if (cycleRow) {
        const { data: asRows, error: asErr } = await supabase
          .from('physio_assessment')
          .select(
            'id, assessment_date, note, ratings:physio_goal_rating (approved_goal_id, nrs_value, gas_value)'
          )
          .eq('treatment_cycle_id', cycleRow.id as string)
          .order('assessment_date', { ascending: true });
        if (asErr) throw asErr;
        assessments = (asRows ?? []).map((a) => ({
          id: a.id as string,
          assessmentDate: a.assessment_date as string,
          note: (a.note as string | null) ?? null,
          ratings: ((a.ratings as Array<{
            approved_goal_id: string;
            nrs_value: number | null;
            gas_value: number | null;
          }> | null) ?? []).map((r) => ({
            approvedGoalId: r.approved_goal_id,
            nrsValue: r.nrs_value,
            gasValue: r.gas_value
          }))
        }));
      }

      // The treating physician's handoff note for the active cycle. Shown
      // to the therapist regardless of the muscle-sharing preference — it's
      // a deliberate message to them, not injection detail. RLS restricts it
      // to professionals with an active session; the patient has no read
      // policy on treatment_handoff, so it can never reach them. Only the
      // active cycle's note is surfaced (the cycle they're working within).
      let handoff: PhysioPatientData['handoff'] = null;
      if (cycleRow) {
        const { data: hoRow, error: hoErr } = await supabase
          .from('treatment_handoff')
          .select('note, treatment_changed')
          .eq('treatment_cycle_id', cycleRow.id as string)
          .maybeSingle();
        if (hoErr) throw hoErr;
        const hoNote = (hoRow?.note as string | null) ?? null;
        const hoChanged = (hoRow?.treatment_changed as boolean | null) ?? null;
        if (hoRow && (hoNote || hoChanged !== null)) {
          // The treatment date for "from the {date} visit". The active
          // cycle has exactly one treatment_session; fetch just its date.
          const { data: tsDateRow } = await supabase
            .from('treatment_session')
            .select('date')
            .eq('treatment_cycle_id', cycleRow.id as string)
            .maybeSingle();
          handoff = {
            treatmentDate: (tsDateRow?.date as string | null) ?? null,
            note: hoNote,
            treatmentChanged: hoChanged
          };
        }
      }

      return {
        patient: {
          id: patientId,
          displayName: (profileRow?.display_name as string) ?? 'Patient',
          exercisePlan:
            (patientRow.physio_exercise_plan as string | null) ?? null,
          assistiveDevices:
            (patientRow.physio_assistive_devices as string | null) ?? null
        },
        cycle: cycleRow
          ? {
              id: cycleRow.id as string,
              cycleNumber: cycleRow.cycle_number as number,
              startDate: cycleRow.start_date as string
            }
          : null,
        goals,
        latestTreatment,
        handoff,
        assessments,
        checkins
      };
    }
  });
}

/**
 * Therapist updates the per-patient exercise plan and assistive
 * devices (free text). Calls set_physio_plan, which enforces that the
 * caller is a therapist with an active session for the patient.
 */
export function useSetPhysioPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      patientId: string;
      exercisePlan: string;
      assistiveDevices: string;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('set_physio_plan', {
        p_patient_id: input.patientId,
        p_exercise_plan: input.exercisePlan,
        p_assistive_devices: input.assistiveDevices
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['physioPatient'] });
    }
  });
}
