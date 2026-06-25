'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

export interface ItbDoseChange {
  id: string;
  changedOn: string;
  doseMcgPerDay: number | null;
  note: string | null;
}

export interface ItbTherapy {
  id: string;
  startedOn: string | null;
  note: string | null;
  /** Dose changes, most recent last. */
  doseChanges: ItbDoseChange[];
  /** The latest dose change by date, if any. */
  currentDose: ItbDoseChange | null;
}

/** The patient's active ITB therapy + its dose-titration log, or null. */
export function useItbTherapy(patientId: string | null) {
  return useQuery({
    enabled: !!patientId,
    queryKey: ['itbTherapy', patientId],
    queryFn: async (): Promise<ItbTherapy | null> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('itb_therapy')
        .select(
          'id, started_on, note, doses:itb_dose_change (id, changed_on, dose_mcg_per_day, note)'
        )
        .eq('patient_id', patientId!)
        .is('ended_on', null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const doseChanges: ItbDoseChange[] = (
        (data.doses as Array<{
          id: string;
          changed_on: string;
          dose_mcg_per_day: number | null;
          note: string | null;
        }>) ?? []
      )
        .map((d) => ({
          id: d.id,
          changedOn: d.changed_on,
          doseMcgPerDay:
            d.dose_mcg_per_day == null ? null : Number(d.dose_mcg_per_day),
          note: d.note ?? null
        }))
        .sort((a, b) => a.changedOn.localeCompare(b.changedOn));

      return {
        id: data.id as string,
        startedOn: (data.started_on as string | null) ?? null,
        note: (data.note as string | null) ?? null,
        doseChanges,
        currentDose: doseChanges.length
          ? doseChanges[doseChanges.length - 1]
          : null
      };
    }
  });
}

export function useStartItbTherapy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      patientId: string;
      startedOn: string | null;
      note: string | null;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('start_itb_therapy', {
        p_patient_id: input.patientId,
        p_started_on: input.startedOn as string,
        p_note: input.note as string
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['itbTherapy', vars.patientId] });
    }
  });
}

export function useLogItbDoseChange(patientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      therapyId: string;
      changedOn: string | null;
      dose: number | null;
      note: string | null;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('log_itb_dose_change', {
        p_therapy_id: input.therapyId,
        p_changed_on: input.changedOn as string,
        p_dose: input.dose as number,
        p_note: input.note as string
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['itbTherapy', patientId] });
    }
  });
}
