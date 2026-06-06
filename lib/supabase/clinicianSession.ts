'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import { normalizeVisitCodeInput } from '../visitCode';

export interface CurrentClinicianSession {
  id: string;
  patientId: string;
  startedAt: string;
  lastActivityAt: string;
}

/**
 * The unlocking professional's currently active session, if any.
 * "Professional" = physician (role 'clinician') or physiotherapist —
 * both unlock patients via the same visit-code mechanism and both get
 * a row in clinician_session. Active is defined as: ended_at is null
 * AND last_activity_at > now() - 1h. RLS enforces the same boundary.
 */
export function useCurrentClinicianSession(
  profileId: string | null,
  role: string | null | undefined
) {
  return useQuery({
    queryKey: ['clinicianSession', profileId],
    enabled:
      !!profileId &&
      (role === 'clinician' || role === 'physiotherapist'),
    queryFn: async (): Promise<CurrentClinicianSession | null> => {
      const supabase = createSupabaseBrowserClient();
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('clinician_session')
        .select('id, patient_id, started_at, last_activity_at, ended_at')
        .is('ended_at', null)
        .gt('last_activity_at', oneHourAgo)
        .order('last_activity_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id as string,
        patientId: data.patient_id as string,
        startedAt: data.started_at as string,
        lastActivityAt: data.last_activity_at as string
      };
    },
    // Refetch every 30s so a stale session is detected reasonably soon.
    refetchInterval: 30_000
  });
}

export function useUnlockWithCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rawInput: string): Promise<string> => {
      const code = normalizeVisitCodeInput(rawInput);
      if (code.length !== 6) {
        throw new Error('Code must be 6 characters');
      }
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('unlock_with_visit_code', {
        p_code: code
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinicianSession'] });
    }
  });
}

export function useTouchClinicianSession() {
  return useMutation<void, Error, string | void>({
    mutationFn: async (patientId): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = patientId
        ? await supabase.rpc('touch_clinician_session', {
            p_patient_id: patientId
          })
        : await supabase.rpc('touch_clinician_session');
      if (error) throw error;
    }
  });
}

export function useEndClinicianSession() {
  const qc = useQueryClient();
  return useMutation<void, Error, string | void>({
    mutationFn: async (patientId): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = patientId
        ? await supabase.rpc('end_clinician_session', {
            p_patient_id: patientId
          })
        : await supabase.rpc('end_clinician_session');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinicianSession'] });
      qc.invalidateQueries({ queryKey: ['clinicianPatient'] });
      qc.invalidateQueries({ queryKey: ['mySessions'] });
    }
  });
}

export interface MySession {
  patientId: string;
  displayName: string;
  lastActivityAt: string;
  isActive: boolean;
}

/** This clinician's own sessions from today — the switcher list. Active rows
 *  can be switched back to; inactive rows can be reopened (same-day, no new
 *  code). Refetches periodically so an aging session flips to "reopen". */
export function useMySessions(
  profileId: string | null,
  role: string | null | undefined
) {
  return useQuery({
    queryKey: ['mySessions', profileId],
    enabled:
      !!profileId && (role === 'clinician' || role === 'physiotherapist'),
    queryFn: async (): Promise<MySession[]> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('list_my_sessions');
      if (error) throw error;
      return ((data as Array<Record<string, unknown>>) ?? []).map((r) => ({
        patientId: r.patient_id as string,
        displayName: (r.display_name as string) ?? 'Patient',
        lastActivityAt: r.last_activity_at as string,
        isActive: Boolean(r.is_active)
      }));
    },
    refetchInterval: 30_000
  });
}

/** Switch focus to an already-open patient: touch their session so it becomes
 *  the most-recently-active (the "current" one the patient view reads). */
export function useSwitchSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patientId: string): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('touch_clinician_session', {
        p_patient_id: patientId
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinicianSession'] });
      qc.invalidateQueries({ queryKey: ['mySessions'] });
    }
  });
}

/** Reopen a patient unlocked earlier today, without a fresh code. */
export function useReopenSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patientId: string): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('reopen_session', {
        p_patient_id: patientId
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinicianSession'] });
      qc.invalidateQueries({ queryKey: ['mySessions'] });
    }
  });
}
