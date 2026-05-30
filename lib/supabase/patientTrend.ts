'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import type { GoalOutcome } from './clinicianPatient';

/**
 * Longitudinal (cross-cycle) data for one patient.
 *
 * The regular clinician patient hook (useClinicianPatientData) loads
 * only the ACTIVE cycle. This hook instead gathers a compact summary
 * of EVERY cycle the patient has had, so the history view can show how
 * treatment and goals have changed over time.
 *
 * Per cycle it returns:
 *   - cycleNumber, startDate, status
 *   - totalUnits — the treatment session's total dose (null if no
 *     treatment was recorded for that cycle)
 *   - goals — the goals belonging to that cycle, each with its text,
 *     kind, lifecycle status, and (if retired) its outcome.
 *
 * Note on outcomes vs. a GAS trajectory: goals are *living* — reviewed
 * and changed at each visit, often replaced by harder goals as the
 * patient improves. So a connected cross-cycle "average GAS" line is
 * misleading (it compares different goals at each point, and a harder
 * goal scoring lower looks like regression when it is progress). This
 * hook therefore does NOT compute an averaged per-cycle GAS. Instead it
 * surfaces each cycle's goals and how they ended, which is the
 * interpretable cross-cycle signal. Dose is objective and is kept.
 *
 * Physician-facing only — used by the history page.
 */

export interface CycleGoalSummary {
  id: string;
  patientFacingText: string;
  kind: 'nrs' | 'gas';
  /** 'active' | 'archived' | 'combined' */
  status: string;
  /** Set when the goal was retired; null while active. */
  outcome: GoalOutcome | null;
}

export interface CycleTrendPoint {
  cycleId: string;
  cycleNumber: number;
  startDate: string;
  status: string;
  totalUnits: number | null;
  goals: CycleGoalSummary[];
}

export interface PatientTrend {
  patientId: string;
  cycles: CycleTrendPoint[];
}

export function usePatientTrend(patientId: string | null) {
  return useQuery({
    queryKey: ['patientTrend', patientId],
    enabled: !!patientId,
    queryFn: async (): Promise<PatientTrend | null> => {
      if (!patientId) return null;
      const supabase = createSupabaseBrowserClient();

      // 1. Every cycle for this patient, oldest first.
      const { data: cycleRows, error: cErr } = await supabase
        .from('treatment_cycle')
        .select('id, cycle_number, start_date, status')
        .eq('patient_id', patientId)
        .order('cycle_number', { ascending: true });
      if (cErr) throw cErr;
      if (!cycleRows || cycleRows.length === 0) {
        return { patientId, cycles: [] };
      }

      const cycleIds = cycleRows.map((c) => c.id as string);

      // 2. Treatment sessions — total dose per cycle. A cycle has at
      //    most one session; map by treatment_cycle_id.
      const { data: sessionRows, error: sErr } = await supabase
        .from('treatment_session')
        .select('treatment_cycle_id, total_units')
        .in('treatment_cycle_id', cycleIds);
      if (sErr) throw sErr;
      const unitsByCycle = new Map<string, number>();
      for (const s of sessionRows ?? []) {
        unitsByCycle.set(
          s.treatment_cycle_id as string,
          Number(s.total_units)
        );
      }

      // 3. Goals for every cycle, with kind, status, and outcome. This
      //    replaces the old averaged-GAS "final outcome" number with
      //    the per-goal outcomes the history view now shows.
      const { data: goalRows, error: gErr } = await supabase
        .from('approved_goal')
        .select(
          'id, treatment_cycle_id, patient_facing_text, goal_kind, status, goal_outcome, approved_at'
        )
        .eq('patient_id', patientId)
        .order('approved_at', { ascending: true });
      if (gErr) throw gErr;

      const goalsByCycle = new Map<string, CycleGoalSummary[]>();
      for (const g of goalRows ?? []) {
        const cycleId = g.treatment_cycle_id as string;
        if (!cycleIds.includes(cycleId)) continue;
        const list = goalsByCycle.get(cycleId) ?? [];
        list.push({
          id: g.id as string,
          patientFacingText: g.patient_facing_text as string,
          kind: (g.goal_kind as 'nrs' | 'gas') ?? 'nrs',
          status: g.status as string,
          outcome: (g.goal_outcome as GoalOutcome | null) ?? null
        });
        goalsByCycle.set(cycleId, list);
      }

      const cycles: CycleTrendPoint[] = cycleRows.map((c) => {
        const cycleId = c.id as string;
        return {
          cycleId,
          cycleNumber: c.cycle_number as number,
          startDate: c.start_date as string,
          status: c.status as string,
          totalUnits: unitsByCycle.get(cycleId) ?? null,
          goals: goalsByCycle.get(cycleId) ?? []
        };
      });

      return { patientId, cycles };
    }
  });
}
