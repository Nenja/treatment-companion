'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

/** One rating recorded under a specific goal version, normalised. */
export interface GoalHistoryRating {
  /** NRS 0–10 for NRS goals; GAS level −2..+2 for GAS goals. */
  value: number;
  /** ISO date the rating was made (check-in submit / assessment date). */
  date: string;
}

export interface GoalHistoryVersion {
  id: string;
  version: number;
  patientFacingText: string;
  smartText: string;
  kind: 'nrs' | 'gas';
  nrsBaseline: number | null;
  nrsTarget: number | null;
  gas: {
    minus2: string;
    minus1: string;
    zero: string;
    plus1: string;
    plus2: string;
  } | null;
  cycleNumber: number | null;
  cycleStartDate: string | null;
  approvedAt: string;
  isLive: boolean;
  patientRatings: GoalHistoryRating[];
  therapistRatings: GoalHistoryRating[];
}

/**
 * Loads every version of a goal lineage (oldest first) with the ratings made
 * under each version. Because ratings point at a specific version row, each
 * version's ratings are exactly those recorded under the calibration that was
 * live at the time — the goal's evolution. Read-only; RLS scopes it to
 * patients the caller can access.
 */
export function useGoalHistory(lineageId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['goalHistory', lineageId],
    enabled: !!lineageId && enabled,
    queryFn: async (): Promise<GoalHistoryVersion[]> => {
      const supabase = createSupabaseBrowserClient();

      const { data: versionRows, error: vErr } = await supabase
        .from('approved_goal')
        .select(
          'id, version, patient_facing_text, smart_text, goal_kind, nrs_baseline_value, nrs_target_value, anchor_minus2, anchor_minus1, anchor_zero, anchor_plus1, anchor_plus2, approved_at, superseded_at, treatment_cycle:treatment_cycle_id ( cycle_number, start_date )'
        )
        .eq('lineage_id', lineageId!)
        .order('version', { ascending: true });
      if (vErr) throw vErr;
      const versions = versionRows ?? [];
      const ids = versions.map((v: { id: string }) => v.id as string);
      if (ids.length === 0) return [];

      const [{ data: weekly, error: wErr }, { data: physio, error: pErr }] =
        await Promise.all([
          supabase
            .from('weekly_goal_rating')
            .select(
              'approved_goal_id, nrs_value, rating_value, rating_label, weekly_checkin:weekly_checkin_id ( submitted_at )'
            )
            .in('approved_goal_id', ids),
          supabase
            .from('physio_goal_rating')
            .select(
              'approved_goal_id, nrs_value, gas_value, physio_assessment:physio_assessment_id ( assessment_date )'
            )
            .in('approved_goal_id', ids)
        ]);
      if (wErr) throw wErr;
      if (pErr) throw pErr;

      const patientByGoal = new Map<string, GoalHistoryRating[]>();
      const therapistByGoal = new Map<string, GoalHistoryRating[]>();

      for (const r of weekly ?? []) {
        const gid = r.approved_goal_id as string;
        // notSure ratings carry no value.
        if ((r.rating_label as string) === 'notSure') continue;
        const kindIsNrs = (r.nrs_value as number | null) != null;
        const value = kindIsNrs
          ? (r.nrs_value as number)
          : (r.rating_value as number | null);
        if (value == null) continue;
        const date =
          ((r.weekly_checkin as { submitted_at?: string } | null)
            ?.submitted_at as string) ?? '';
        const arr = patientByGoal.get(gid) ?? [];
        arr.push({ value, date });
        patientByGoal.set(gid, arr);
      }

      for (const r of physio ?? []) {
        const gid = r.approved_goal_id as string;
        const nrs = r.nrs_value as number | null;
        const gas = r.gas_value as number | null;
        const value = nrs != null ? nrs : gas;
        if (value == null) continue; // flag-only assessment row
        const date =
          ((r.physio_assessment as { assessment_date?: string } | null)
            ?.assessment_date as string) ?? '';
        const arr = therapistByGoal.get(gid) ?? [];
        arr.push({ value, date });
        therapistByGoal.set(gid, arr);
      }

      const byDate = (a: GoalHistoryRating, b: GoalHistoryRating) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : 0;

      return versions.map((v: Record<string, unknown>) => {
        const cycle = (v.treatment_cycle as {
          cycle_number?: number;
          start_date?: string;
        } | null) ?? null;
        const kind = ((v.goal_kind as 'nrs' | 'gas') ?? 'nrs') as 'nrs' | 'gas';
        return {
          id: v.id as string,
          version: (v.version as number) ?? 1,
          patientFacingText: v.patient_facing_text as string,
          smartText: v.smart_text as string,
          kind,
          nrsBaseline: (v.nrs_baseline_value as number | null) ?? null,
          nrsTarget: (v.nrs_target_value as number | null) ?? null,
          gas:
            kind === 'gas'
              ? {
                  minus2: (v.anchor_minus2 as string) ?? '',
                  minus1: (v.anchor_minus1 as string) ?? '',
                  zero: (v.anchor_zero as string) ?? '',
                  plus1: (v.anchor_plus1 as string) ?? '',
                  plus2: (v.anchor_plus2 as string) ?? ''
                }
              : null,
          cycleNumber: cycle?.cycle_number ?? null,
          cycleStartDate: cycle?.start_date ?? null,
          approvedAt: v.approved_at as string,
          isLive: (v.superseded_at as string | null) == null,
          patientRatings: (patientByGoal.get(v.id as string) ?? []).sort(byDate),
          therapistRatings: (therapistByGoal.get(v.id as string) ?? []).sort(
            byDate
          )
        };
      });
    }
  });
}
