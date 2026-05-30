'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

/**
 * Clinical background information about a patient — entered by the
 * clinician or therapist, read by both. NOT visible to the patient.
 * All fields are optional; the UI must render gracefully when they
 * are null.
 */
export type Etiology =
  | 'stroke'
  | 'tbi'
  | 'cerebralPalsy'
  | 'multipleSclerosis'
  | 'spinalCordInjury'
  | 'hereditarySpasticParaplegia'
  | 'other';

export type AmbulationStatus =
  | 'independent'
  | 'withAid'
  | 'wheelchair'
  | 'nonAmbulant';

export type AffectedSide = 'left' | 'right' | 'bilateral';

export type Sex = 'female' | 'male' | 'other' | 'preferNotToSay';

export interface PatientInfo {
  patientId: string;
  displayName: string;
  dateOfBirth: string | null;
  etiology: Etiology | null;
  etiologyDetail: string | null;
  affectedSide: AffectedSide | null;
  onsetYear: number | null;
  ambulation: AmbulationStatus | null;
  backgroundNotes: string | null;
  sex: Sex | null;
  assistiveDevices: string | null;
}

/**
 * Read the patient's clinical background. Both clinician and
 * therapist roles can read; access is gated by RLS (an active session
 * for that patient). Enabled only when patientId is known.
 */
export function usePatientInfo(patientId: string | null) {
  return useQuery({
    enabled: !!patientId,
    queryKey: ['patientInfo', patientId],
    queryFn: async (): Promise<PatientInfo | null> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('patient')
        .select(
          'id, date_of_birth, etiology, etiology_detail, affected_side, onset_year, ambulation, background_notes, sex, physio_assistive_devices, profile:profile_id (display_name)'
        )
        .eq('id', patientId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const profile = Array.isArray(data.profile)
        ? data.profile[0]
        : (data.profile as { display_name?: string } | null);
      return {
        patientId: data.id as string,
        displayName: (profile?.display_name as string) ?? 'Patient',
        dateOfBirth: (data.date_of_birth as string | null) ?? null,
        etiology: (data.etiology as Etiology | null) ?? null,
        etiologyDetail: (data.etiology_detail as string | null) ?? null,
        affectedSide: (data.affected_side as AffectedSide | null) ?? null,
        onsetYear: (data.onset_year as number | null) ?? null,
        ambulation: (data.ambulation as AmbulationStatus | null) ?? null,
        backgroundNotes: (data.background_notes as string | null) ?? null,
        sex: (data.sex as Sex | null) ?? null,
        assistiveDevices:
          (data.physio_assistive_devices as string | null) ?? null
      };
    }
  });
}

export interface SetPatientInfoInput {
  patientId: string;
  dateOfBirth: string | null;
  etiology: Etiology | null;
  etiologyDetail: string | null;
  affectedSide: AffectedSide | null;
  onsetYear: number | null;
  ambulation: AmbulationStatus | null;
  backgroundNotes: string | null;
  sex: Sex | null;
  assistiveDevices: string | null;
}

/**
 * Write the patient's clinical background. Server enforces that the
 * caller is a clinician OR therapist with an active session.
 */
export function useSetPatientInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetPatientInfoInput): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('set_patient_info', {
        p_patient_id: input.patientId,
        p_date_of_birth: input.dateOfBirth,
        p_etiology: input.etiology,
        p_etiology_detail: input.etiologyDetail,
        p_affected_side: input.affectedSide,
        p_onset_year: input.onsetYear,
        p_ambulation: input.ambulation,
        p_background_notes: input.backgroundNotes,
        p_sex: input.sex,
        p_assistive_devices: input.assistiveDevices
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['patientInfo', vars.patientId] });
      // Also invalidate the broader patient queries that show summary
      // info, so any header lines (age, etiology) refresh.
      qc.invalidateQueries({ queryKey: ['clinicianPatient'] });
      qc.invalidateQueries({ queryKey: ['physioPatient'] });
    }
  });
}

/** Compute current age (in whole years) from an ISO date of birth. */
export function ageFromDob(iso: string | null): number | null {
  if (!iso) return null;
  const dob = new Date(iso);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

/** Compute years since onset from an onset year. */
export function yearsSince(onsetYear: number | null): number | null {
  if (!onsetYear) return null;
  return new Date().getFullYear() - onsetYear;
}

/**
 * Build a quiet at-a-glance summary line from the clinical background,
 * skipping any fields that are not filled in. Returns null if there's
 * nothing to show, so the caller can omit the line entirely rather
 * than render "Not recorded · Not recorded · Not recorded".
 *
 * Translation labels are passed in (etiology, side, ambulation) so this
 * helper stays locale-free.
 */
export function formatPatientSummary(
  info: PatientInfo | null,
  labels: {
    ageYears: (years: number) => string;
    etiology: (key: Etiology) => string;
    side: (key: AffectedSide) => string;
    ambulation: (key: AmbulationStatus) => string;
  }
): string | null {
  if (!info) return null;
  const parts: string[] = [];
  const age = ageFromDob(info.dateOfBirth);
  if (age !== null) parts.push(labels.ageYears(age));
  if (info.etiology) parts.push(labels.etiology(info.etiology));
  if (info.affectedSide) parts.push(labels.side(info.affectedSide));
  if (info.ambulation) parts.push(labels.ambulation(info.ambulation));
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Patient-facing: read the caller's own sex (for their profile page).
 * A patient can read their own patient row under RLS. Returns null
 * while unknown/unset. Separate from usePatientInfo, which is the
 * clinician/therapist view of the full clinical background.
 */
export function useOwnSex(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['ownSex'],
    queryFn: async (): Promise<Sex | null> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('patient')
        .select('sex')
        .maybeSingle();
      if (error) throw error;
      return ((data?.sex as Sex | null) ?? null) || null;
    }
  });
}

/**
 * Patient-facing: set the caller's own sex via the patient-scoped
 * set_own_sex RPC (which can touch only the caller's own row and only
 * this one field).
 */
export function useSetOwnSex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sex: Sex | null): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('set_own_sex', { p_sex: sex });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ownSex'] });
    }
  });
}

/**
 * Patient-facing: read the caller's own date of birth (ISO 'YYYY-MM-DD'
 * or null). Used by the onboarding details step to pre-fill / skip when
 * already set.
 */
export function useOwnDateOfBirth(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['ownDob'],
    queryFn: async (): Promise<string | null> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('patient')
        .select('date_of_birth')
        .maybeSingle();
      if (error) throw error;
      return ((data?.date_of_birth as string | null) ?? null) || null;
    }
  });
}

/**
 * Patient-facing: set the caller's own date of birth via the
 * patient-scoped set_own_date_of_birth RPC (caller's own row, only the
 * date_of_birth field).
 */
export function useSetOwnDateOfBirth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (iso: string | null): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('set_own_date_of_birth', {
        p_date_of_birth: iso
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ownDob'] });
    }
  });
}
