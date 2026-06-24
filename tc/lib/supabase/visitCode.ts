'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import { generateVisitCodeString } from '../visitCode';

export interface ActiveVisitCode {
  code: string;
  expiresAt: string;
}

/**
 * Looks up the patient's currently-active (unconsumed, unexpired)
 * visit code, if any. The RPC always invalidates prior codes when a new
 * one is generated, so at most one row matches.
 */
export function useActiveVisitCode(
  profileId: string | null,
  role: string | null | undefined
) {
  return useQuery({
    queryKey: ['visitCode', profileId],
    enabled: !!profileId && role === 'patient',
    queryFn: async (): Promise<ActiveVisitCode | null> => {
      const supabase = createSupabaseBrowserClient();
      // RLS makes visit_code visible only to its owning patient, so we
      // can just SELECT without joining through patient.
      const { data, error } = await supabase
        .from('visit_code')
        .select('code, expires_at, consumed_at')
        .is('consumed_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        code: data.code as string,
        expiresAt: data.expires_at as string
      };
    }
  });
}

/**
 * Generates a fresh visit code via the generate_visit_code RPC. The
 * RPC takes a client-generated code string so we can show it
 * immediately without a round-trip. The server enforces format and
 * uniqueness.
 */
export function useGenerateVisitCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ActiveVisitCode> => {
      const supabase = createSupabaseBrowserClient();
      const code = generateVisitCodeString();
      const { data, error } = await supabase.rpc('generate_visit_code', {
        p_code: code
      });
      if (error) throw error;
      // The RPC returns the inserted visit_code row.
      return {
        code: (data as { code: string }).code,
        expiresAt: (data as { expires_at: string }).expires_at
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visitCode'] });
    }
  });
}
