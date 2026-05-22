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
          .select('id, patient_facing_text')
          .eq('treatment_cycle_id', cycleRow.id as string)
          .eq('status', 'active')
          .order('approved_at', { ascending: true });
        if (gErr) throw gErr;
        goals = (goalRows ?? []).map((g) => ({
          id: g.id as string,
          patientFacingText: g.patient_facing_text as string
        }));
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
        goals
      };
    }
  });
}
