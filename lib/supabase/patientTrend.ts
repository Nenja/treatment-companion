'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

/**
 * Longitudinal (cross-cycle) data for one patient.
 *
 * The regular clinician patient hook (useClinicianPatientData) loads
 * only the ACTIVE cycle. This hook instead gathers a compact summary
 * of EVERY cycle the patient has had, so the trend view can show how
 * treatment and outcomes have changed over time.
 *
 * Per cycle it returns:
 *   - cycleNumber, startDate, status
 *   - totalUnits — the treatment session's total dose (null if no
 *     treatment was recorded for that cycle)
 *   - finalGas — the goal outcome for the cycle: the GAS rating
 *     (-2..+2) from the LAST completed check-in of the cycle. When a
 *     cycle had more than one goal, this averages their final GAS so
 *     the cycle has a single comparable outcome number. Null if the
 *     cycle has no completed check-ins yet.
 *
 * Physician-facing only — used by the longitudinal page, which is
 * reached from the clinician patient page.
 */

export interface CycleTrendPoint {
  cycleId: string;
  cycleNumber: number;
  startDate: string;
  status: string;
  totalUnits: number | null;
  finalGas: number | null;
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

      // 3. Goal ratings — to derive each cycle's final outcome. Pull
      //    every rating joined to its check-in's cycle and week, so we
      //    can pick the latest week per cycle.
      const { data: ratingRows, error: rErr } = await supabase
        .from('weekly_goal_rating')
        .select(
          'rating_value, weekly_checkin:weekly_checkin_id (treatment_cycle_id, week_number)'
        );
      if (rErr) throw rErr;

      // For each cycle, find the highest week_number that has ratings,
      // then average the rating_value of that week's ratings.
      // latestWeek: cycleId -> week number. byCycleWeek: "cycleId:week"
      // -> list of rating values.
      const latestWeek = new Map<string, number>();
      const byCycleWeek = new Map<string, number[]>();
      for (const r of ratingRows ?? []) {
        const ci = Array.isArray(r.weekly_checkin)
          ? r.weekly_checkin[0]
          : r.weekly_checkin;
        if (!ci) continue;
        const cycleId = ci.treatment_cycle_id as string;
        if (!cycleIds.includes(cycleId)) continue; // other patients
        const week = ci.week_number as number;
        const value = r.rating_value as number | null;
        if (value === null || value === undefined) continue;

        const prevLatest = latestWeek.get(cycleId);
        if (prevLatest === undefined || week > prevLatest) {
          latestWeek.set(cycleId, week);
        }
        const key = `${cycleId}:${week}`;
        const list = byCycleWeek.get(key) ?? [];
        list.push(value);
        byCycleWeek.set(key, list);
      }

      const cycles: CycleTrendPoint[] = cycleRows.map((c) => {
        const cycleId = c.id as string;
        const week = latestWeek.get(cycleId);
        let finalGas: number | null = null;
        if (week !== undefined) {
          const values = byCycleWeek.get(`${cycleId}:${week}`) ?? [];
          if (values.length > 0) {
            const sum = values.reduce((a, b) => a + b, 0);
            // Average across the cycle's goals, rounded to one decimal.
            finalGas = Math.round((sum / values.length) * 10) / 10;
          }
        }
        return {
          cycleId,
          cycleNumber: c.cycle_number as number,
          startDate: c.start_date as string,
          status: c.status as string,
          totalUnits: unitsByCycle.get(cycleId) ?? null,
          finalGas
        };
      });

      return { patientId, cycles };
    }
  });
}
