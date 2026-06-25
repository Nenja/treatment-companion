'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

/**
 * One point on a goal's progress graph — a single week's self-reported
 * rating. Structurally matches the `ratings` prop GoalProgressView
 * expects, so it can be passed straight to the graph modal.
 */
export interface GoalRatingPoint {
  weekNumber: number;
  value: -2 | -1 | 0 | 1 | 2 | null;
  /** Raw NRS value (0-10) for NRS goals; null for GAS goals. */
  nrs: number | null;
  reported: boolean;
  comment?: string;
  submitterLabel?: 'self' | 'caregiver';
}

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
    startDate: string;
  } | null;
  /** Approved, currently-active goals, each with the patient's own
   *  self-report history so the home page can show a read-only progress
   *  graph on demand. */
  goals: {
    id: string;
    patientFacingText: string;
    kind: 'nrs' | 'gas';
    /** NRS goals only: which way is clinically better (drives the graph's
     *  direction cue). 'higherIsBetter' for GAS / when unknown. */
    nrsDirection: 'higherIsBetter' | 'lowerIsBetter';
    ratings: GoalRatingPoint[];
  }[];
  /**
   * The patient's most recent treatment session — date plus the muscles
   * injected (name + side) — so the home page can show, on demand, which
   * muscles were treated last time. Dosing detail is intentionally
   * omitted. Null when no treatment is recorded.
   */
  latestTreatment: {
    date: string;
    muscles: { muscle: string; side: 'left' | 'right' | 'bilateral' }[];
  } | null;
  /**
   * The pending prompt for the patient's current week, if any. This is
   * what the "Your check-in is ready" card highlights. Null when the
   * current week has already been filled in (so the patient is up to
   * date for now).
   */
  currentPrompt: {
    id: string;
    weekNumber: number;
    dueDate: string;
  } | null;
  /**
   * Pending prompts from the last 2 weeks (within the catch-up window)
   * that the patient still hasn't filled in. Excludes the current week
   * (that's currentPrompt). Older pending prompts beyond the catch-up
   * window are NOT included — they remain in the database but invisible
   * to the patient.
   */
  catchUpPrompts: {
    id: string;
    weekNumber: number;
    dueDate: string;
  }[];
  /** Current week number since treatment (1-indexed). */
  currentWeek: number;
  /** Week numbers that have a completed check-in. */
  completedWeeks: number[];
  /** Count of the patient's suggestions still awaiting clinician review. */
  pendingSuggestions: number;
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
        displayName: (() => {
          const prof = patientRow.profile as unknown as
            | { display_name?: string | null }
            | { display_name?: string | null }[]
            | null;
          const dn = Array.isArray(prof) ? prof[0]?.display_name : prof?.display_name;
          return dn ?? 'Patient';
        })()
      };

      // Pending (awaiting-review) suggestions — shown as a "sent, your
      // clinician will review" status so the patient feels heard. Patients
      // can suggest before any cycle exists, so this is fetched before the
      // no-cycle branch and surfaced in both states.
      const { count: pendingCount, error: sErr } = await supabase
        .from('goal_suggestion')
        .select('id', { count: 'exact', head: true })
        .eq('patient_id', patient.id)
        .eq('status', 'needsReview');
      if (sErr) throw sErr;
      const pendingSuggestions = pendingCount ?? 0;

      // 2. Active cycle (most recent)
      const { data: cycleRow, error: cErr } = await supabase
        .from('treatment_cycle')
        .select('id, cycle_number, start_date')
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
            startDate: cycleRow.start_date as string
          }
        : null;

      if (!cycle) {
        return {
          patient,
          cycle: null,
          goals: [],
          latestTreatment: null,
          currentPrompt: null,
          catchUpPrompts: [],
          currentWeek: 0,
          completedWeeks: [],
          pendingSuggestions
        };
      }

      // 3. Active approved goals for this cycle
      const { data: goalsRows, error: gErr } = await supabase
        .from('approved_goal')
        .select('id, patient_facing_text, goal_kind, nrs_direction')
        .eq('treatment_cycle_id', cycle.id)
        .eq('status', 'active')
        .is('superseded_at', null)
        .order('approved_at', { ascending: true });
      if (gErr) throw gErr;

      // 3b. The patient's own check-in history for this cycle, so each
      //     goal can show a read-only progress graph. RLS scopes these to
      //     the patient's own rows (weekly_checkin_patient_read /
      //     weekly_goal_rating_patient_read).
      const { data: checkinRows, error: ckErr } = await supabase
        .from('weekly_checkin')
        .select(
          'week_number, comment, submitter_label, ratings:weekly_goal_rating (approved_goal_id, rating_value, nrs_value)'
        )
        .eq('patient_id', patient.id)
        .eq('treatment_cycle_id', cycle.id)
        .order('week_number', { ascending: true });
      if (ckErr) throw ckErr;

      const ratingsByGoal = new Map<string, GoalRatingPoint[]>();
      for (const c of checkinRows ?? []) {
        const wk = c.week_number as number;
        const comment = (c.comment as string | null) ?? undefined;
        const submitterLabel =
          (c.submitter_label as 'self' | 'caregiver' | null) ?? undefined;
        const rs =
          (c.ratings as Array<{
            approved_goal_id: string;
            rating_value: number | null;
            nrs_value: number | null;
          }> | null) ?? [];
        for (const r of rs) {
          const arr = ratingsByGoal.get(r.approved_goal_id) ?? [];
          arr.push({
            weekNumber: wk,
            value: (r.rating_value as -2 | -1 | 0 | 1 | 2 | null) ?? null,
            nrs: r.nrs_value as number | null,
            reported: true,
            comment,
            submitterLabel
          });
          ratingsByGoal.set(r.approved_goal_id, arr);
        }
      }

      const goals = (goalsRows ?? []).map((g) => ({
        id: g.id as string,
        patientFacingText: g.patient_facing_text as string,
        kind: (g.goal_kind as 'nrs' | 'gas') ?? 'gas',
        nrsDirection:
          (g.nrs_direction as 'higherIsBetter' | 'lowerIsBetter') ??
          'higherIsBetter',
        ratings: (ratingsByGoal.get(g.id as string) ?? []).sort(
          (a, b) => a.weekNumber - b.weekNumber
        )
      }));

      // 3c. Most recent treatment session + the muscles injected, so the
      //     patient can see "which muscles were treated last time". RLS
      //     scopes treatment_session / muscle_injection to the patient's
      //     own rows. Dosing detail is deliberately left out. Unlike the
      //     physiotherapist view, there is no share-with-physio gate — the
      //     patient is always allowed to see their own treatment.
      let latestTreatment: PatientHomeData['latestTreatment'] = null;
      const { data: tsRow, error: tsErr } = await supabase
        .from('treatment_session')
        .select('id, date, injections:muscle_injection (muscle, side, position)')
        .eq('patient_id', patient.id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (tsErr) throw tsErr;
      if (tsRow) {
        const injections =
          (tsRow.injections as Array<{
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

      // 4. Weekly prompts for this cycle
      const { data: promptRows, error: prErr } = await supabase
        .from('weekly_prompt')
        .select('id, week_number, due_date, status')
        .eq('treatment_cycle_id', cycle.id)
        .order('week_number', { ascending: true });
      if (prErr) throw prErr;

      const completed = (promptRows ?? [])
        .filter((p) => p.status === 'completed')
        .map((p) => p.week_number as number);

      // Compute current week from cycle.start_date and today.
      // Day 0-6 of treatment = week 1, days 7-13 = week 2, etc.
      const startMs = new Date(cycle.startDate).getTime();
      const todayMs = Date.now();
      const daysSinceStart = Math.floor(
        (todayMs - startMs) / (24 * 60 * 60 * 1000)
      );
      const currentWeek = Math.max(1, Math.floor(daysSinceStart / 7) + 1);

      // Catch-up window: patient can fill in current week + 2 weeks back.
      // Older pending prompts stay in the DB but aren't surfaced.
      const CATCH_UP_WEEKS = 2;
      const oldestVisibleWeek = currentWeek - CATCH_UP_WEEKS;

      const pendingPrompts = (promptRows ?? []).filter(
        (p) =>
          p.status === 'pending' &&
          (p.week_number as number) >= oldestVisibleWeek &&
          (p.week_number as number) <= currentWeek
      );

      const currentRow = pendingPrompts.find(
        (p) => (p.week_number as number) === currentWeek
      );
      const currentPrompt = currentRow
        ? {
            id: currentRow.id as string,
            weekNumber: currentRow.week_number as number,
            dueDate: currentRow.due_date as string
          }
        : null;

      const catchUpPrompts = pendingPrompts
        .filter((p) => (p.week_number as number) !== currentWeek)
        .map((p) => ({
          id: p.id as string,
          weekNumber: p.week_number as number,
          dueDate: p.due_date as string
        }));

      return {
        patient,
        cycle,
        goals,
        latestTreatment,
        currentPrompt,
        catchUpPrompts,
        currentWeek,
        completedWeeks: completed,
        pendingSuggestions
      };
    }
  });
}
