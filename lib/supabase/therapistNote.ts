'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

export interface TherapistNoteSummary {
  id: string;
  body: string;
  /** Set once a physician opens the patient's notes; null = delivered only. */
  seenAt: string | null;
  createdAt: string;
}

/**
 * Lists the therapist notes sent for a patient, newest first. RLS limits
 * results to patients the caller has an active unlock for; a patient can
 * never read this table (no patient SELECT policy — migration 0095).
 */
export function useTherapistNotes(patientId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['therapistNotes', patientId],
    enabled: !!patientId && enabled,
    queryFn: async (): Promise<TherapistNoteSummary[]> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('therapist_note')
        .select('id, body, seen_at, created_at')
        .eq('patient_id', patientId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((n) => ({
        id: n.id as string,
        body: n.body as string,
        seenAt: (n.seen_at as string | null) ?? null,
        createdAt: n.created_at as string
      }));
    }
  });
}

/**
 * Sends one therapist note via the submit_therapist_note RPC
 * (physiotherapist-only, access-checked server-side; migration 0095).
 */
export function useSubmitTherapistNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      patientId: string;
      body: string;
    }): Promise<string> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('submit_therapist_note', {
        p_patient_id: input.patientId,
        p_body: input.body
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['therapistNotes'] });
    }
  });
}
