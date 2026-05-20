'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import type { GoalDomain, Importance } from '../types';

export interface SubmitSuggestionInput {
  domain: GoalDomain;
  /** When domain is 'other', the patient's short label. Optional. */
  otherDomainText?: string;
  patientWording: string;
  importance: Importance;
  difficultyContext?: string;
}

/**
 * Submits a new goal suggestion. The patient and active cycle are
 * discovered from the caller's profile via Supabase queries — the
 * caller doesn't have to know either id.
 *
 * If the domain is 'other' and otherDomainText is provided, we prepend
 * the label to patient_wording so the clinician sees the patient's own
 * naming for it. The schema doesn't have a separate column for this
 * (and didn't need one — the patient's wording carries the same info).
 *
 * Invalidates the patientHome query so the home page refetches (the
 * goals section may grow once the clinician approves the suggestion;
 * for now it just reduces noise to invalidate it).
 */
export function useSubmitSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitSuggestionInput): Promise<string> => {
      const supabase = createSupabaseBrowserClient();

      // Resolve the patient id from the caller's profile.
      const { data: userResp } = await supabase.auth.getUser();
      const profileId = userResp.user?.id;
      if (!profileId) throw new Error('Not signed in');

      const { data: patientRow, error: pErr } = await supabase
        .from('patient')
        .select('id')
        .eq('profile_id', profileId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!patientRow) throw new Error('No patient row');

      const patientId = patientRow.id as string;

      // Resolve the active cycle.
      const { data: cycleRow, error: cErr } = await supabase
        .from('treatment_cycle')
        .select('id')
        .eq('patient_id', patientId)
        .eq('status', 'active')
        .order('cycle_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!cycleRow) throw new Error('No active cycle for this patient');

      const cycleId = cycleRow.id as string;

      // Compose the patient wording. If the domain is 'other' and the
      // patient labelled it, prepend that label so the clinician has
      // the context.
      const wording =
        input.domain === 'other' && input.otherDomainText?.trim()
          ? `[${input.otherDomainText.trim()}] ${input.patientWording.trim()}`
          : input.patientWording.trim();

      const { data, error } = await supabase
        .from('goal_suggestion')
        .insert({
          patient_id: patientId,
          treatment_cycle_id: cycleId,
          domain: input.domain,
          patient_wording: wording,
          importance: input.importance,
          difficulty_context: input.difficultyContext?.trim() || null
          // hoped_timeframe omitted — schema defaults to 'notSure'.
          // status omitted — schema defaults to 'needsReview'.
        })
        .select('id')
        .single();

      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patientHome'] });
    }
  });
}
