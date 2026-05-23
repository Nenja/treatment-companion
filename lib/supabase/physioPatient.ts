'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

export interface PhysioPatientData {
  patient: {
    id: string;
    displayName: string;
  };
  cycle: {
    id: string;
    cycleNumber: number;
    startDate: string;
  } | null;
  goals: {
    id: string;
    patientFacingText: string;
    /** NRS question + direction, needed to render the rating picker. */
    nrsQuestion: string;
    nrsDirection: 'higherIsBetter' | 'lowerIsBetter';
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
        .select('id, profile_id')
        .limit(1)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!patientRow) return null;

      const patientId = patientRow.id as string;

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
      if (cycleRow) {
        const { data: goalRows, error: gErr } = await supabase
          .from('approved_goal')
          .select(
            'id, patient_facing_text, nrs_question, nrs_direction'
          )
          .eq('treatment_cycle_id', cycleRow.id as string)
          .eq('status', 'active')
          .order('approved_at', { ascending: true });
        if (gErr) throw gErr;
        goals = (goalRows ?? []).map((g) => ({
          id: g.id as string,
          patientFacingText: g.patient_facing_text as string,
          nrsQuestion: (g.nrs_question as string) ?? '',
          nrsDirection:
            (g.nrs_direction as 'higherIsBetter' | 'lowerIsBetter') ??
            'higherIsBetter'
        }));
      }

      // Most recent treatment session for this patient, with the
      // muscles injected. Latest only — the physiotherapist needs the
      // current picture, not a history. Doses are not selected.
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

      let latestTreatment: PhysioPatientData['latestTreatment'] = null;
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

      return {
        patient: {
          id: patientId,
          displayName: (profileRow?.display_name as string) ?? 'Patient'
        },
        cycle: cycleRow
          ? {
              id: cycleRow.id as string,
              cycleNumber: cycleRow.cycle_number as number,
              startDate: cycleRow.start_date as string
            }
          : null,
        goals,
        latestTreatment
      };
    }
  });
}
