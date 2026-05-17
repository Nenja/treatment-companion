'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

/**
 * Shape of the data the patient home page needs. Mirrors what the
 * prototype's `useStore()` exposed, but populated from the database.
 */
export interface PatientHomeData {
  patient: {
    id: string;
    displayName: string;
  };
  cycle: {
    id: string;
    cycleNumber: number;
    lengthWeeks: number;
    startDate: string;
    reviewDate: string;
  } | null;
  /** Approved, currently-active goals. */
  goals: {
    id: string;
    patientFacingText: string;
  }[];
  /**
   * The pending weekly prompt for the current week, if any. Null when
   * the patient is up to date.
   */
  pendingPrompt: {
    id: string;
    weekNumber: number;
    dueDate: string;
  } | null;
  /** Total weeks of the cycle (= cycle.lengthWeeks). */
  totalWeeks: number;
  /** Week numbers that have a completed check-in. */
  completedWeeks: number[];
}

/**
 * Fetches everything the home page needs in a single query. Uses a few
 * supabase calls because joining multiple tables in one PostgREST call
 * is messier than just running parallel queries.
 *
 * Pass the user's role so the hook only runs when the user is actually
 * a patient — otherwise the query would 404 / error.
 *
 * Returns null while loading and on error; the component is responsible
 * for rendering a skeleton in that case.
 */
export function usePatientHomeData(
  profileId: string | null,
  role: string | null | undefined
) {
  return useQuery({
    queryKey: ['patientHome', profileId],
    enabled: !!profileId && role === 'patient',
    queryFn: async (): Promise<PatientHomeData> => {
      const supabase = createSupabaseBrowserClient();

      // 1. Patient row + display name from profile
      const { data: patientRow, error: pErr } = await supabase
        .from('patient')
        .select('id, profile:profile_id (display_name)')
        .eq('profile_id', profileId!)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!patientRow) throw new Error('No patient row for this profile');

      const patient = {
        id: patientRow.id as string,
        // Supabase's typed FK lookup returns either a single object or
        // an array depending on the relationship; handle both shapes.
        displayName:
          (Array.isArray(patientRow.profile)
            ? patientRow.profile[0]?.display_name
            : (patientRow.profile as { display_name?: string } | null)?.display_name) ??
          'Patient'
      };

      // 2. Active cycle (most recent)
      const { data: cycleRow, error: cErr } = await supabase
        .from('treatment_cycle')
        .select('id, cycle_number, length_weeks, start_date, review_date')
        .eq('patient_id', patient.id)
        .eq('status', 'active')
        .order('cycle_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cErr) throw cErr;

      const cycle = cycleRow
        ? {
            id: cycleRow.id as string,
            cycleNumber: cycleRow.cycle_number as number,
            lengthWeeks: cycleRow.length_weeks as number,
            startDate: cycleRow.start_date as string,
            reviewDate: cycleRow.review_date as string
          }
        : null;

      if (!cycle) {
        return {
          patient,
          cycle: null,
          goals: [],
          pendingPrompt: null,
          totalWeeks: 0,
          completedWeeks: []
        };
      }

      // 3. Active approved goals for this cycle
      const { data: goalsRows, error: gErr } = await supabase
        .from('approved_goal')
        .select('id, patient_facing_text')
        .eq('treatment_cycle_id', cycle.id)
        .eq('status', 'active')
        .order('approved_at', { ascending: true });
      if (gErr) throw gErr;

      const goals = (goalsRows ?? []).map((g) => ({
        id: g.id as string,
        patientFacingText: g.patient_facing_text as string
      }));

      // 4. Weekly prompts for this cycle
      const { data: promptRows, error: prErr } = await supabase
        .from('weekly_prompt')
        .select('id, week_number, due_date, status')
        .eq('treatment_cycle_id', cycle.id)
        .order('week_number', { ascending: true });
      if (prErr) throw prErr;

      const pending = (promptRows ?? []).find((p) => p.status === 'pending');
      const completed = (promptRows ?? [])
        .filter((p) => p.status === 'completed')
        .map((p) => p.week_number as number);

      const pendingPrompt = pending
        ? {
            id: pending.id as string,
            weekNumber: pending.week_number as number,
            dueDate: pending.due_date as string
          }
        : null;

      return {
        patient,
        cycle,
        goals,
        pendingPrompt,
        totalWeeks: cycle.lengthWeeks,
        completedWeeks: completed
      };
    }
  });
}
