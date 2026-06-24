'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

/**
 * Deeper cross-cycle analysis for one patient — powers the three
 * longitudinal trend charts beyond the basic dose/outcome view:
 *
 *   1. Benefit duration. For each cycle, the peak GAS rating and the
 *      week benefit "faded" — defined as the last week the rating was
 *      still within FADE_THRESHOLD of the cycle's peak. Weeks-of-
 *      benefit is that fade week. This answers "how long did the
 *      treatment hold this time".
 *
 *   2. Per-muscle dose over cycles. Dose per muscle per cycle, limited
 *      to muscles treated in 2 or more cycles (a single-cycle muscle
 *      has no trend to show).
 *
 *   3. Re-treatment timing. The gap (in weeks) between consecutive
 *      treatment dates, shown against the prior cycle's fade week —
 *      so a physician can see whether re-treatment came after benefit
 *      had already faded (possibly too late) or while it still held.
 *
 * Physician-facing only.
 */

/** How far below a cycle's peak the rating must fall to count as
 *  "benefit faded". A drop of 2 GAS points is a meaningful decline. */
const FADE_THRESHOLD = 2;

export interface CycleAnalysis {
  cycleId: string;
  cycleNumber: number;
  startDate: string;
  /** Highest GAS rating recorded in the cycle (null if no check-ins). */
  peakGas: number | null;
  /** Week number at which benefit faded — the last week the rating
   *  was within FADE_THRESHOLD of peak. Null if no check-ins, or if
   *  the rating never fell that far (benefit held throughout). */
  fadeWeek: number | null;
  /** True when the rating never dropped FADE_THRESHOLD below peak —
   *  benefit held for the whole observed period. */
  benefitHeld: boolean;
  /** Weeks from this cycle's treatment to the NEXT cycle's treatment.
   *  Null for the most recent cycle (no next cycle yet). */
  weeksToNextTreatment: number | null;
}

export interface MuscleDosePoint {
  cycleNumber: number;
  doseUnits: number;
}

export interface MuscleDoseTrend {
  muscle: string;
  /** Dose per cycle, only for cycles where this muscle was treated. */
  points: MuscleDosePoint[];
}

export interface PatientCycleAnalysis {
  patientId: string;
  cycles: CycleAnalysis[];
  /** Per-muscle dose trends — muscles treated in 2+ cycles only. */
  muscleTrends: MuscleDoseTrend[];
}

export function usePatientCycleAnalysis(patientId: string | null) {
  return useQuery({
    queryKey: ['patientCycleAnalysis', patientId],
    enabled: !!patientId,
    queryFn: async (): Promise<PatientCycleAnalysis | null> => {
      if (!patientId) return null;
      const supabase = createSupabaseBrowserClient();

      // 1. All cycles, oldest first.
      const { data: cycleRows, error: cErr } = await supabase
        .from('treatment_cycle')
        .select('id, cycle_number, start_date')
        .eq('patient_id', patientId)
        .order('cycle_number', { ascending: true });
      if (cErr) throw cErr;
      if (!cycleRows || cycleRows.length === 0) {
        return { patientId, cycles: [], muscleTrends: [] };
      }
      const cycleIds = cycleRows.map((c) => c.id as string);

      // 2. Treatment sessions — id, cycle, date — for re-treatment
      //    timing and to reach the muscle injections.
      const { data: sessionRows, error: sErr } = await supabase
        .from('treatment_session')
        .select('id, treatment_cycle_id, date')
        .in('treatment_cycle_id', cycleIds);
      if (sErr) throw sErr;
      const sessionByCycle = new Map<
        string,
        { id: string; date: string }
      >();
      for (const s of sessionRows ?? []) {
        sessionByCycle.set(s.treatment_cycle_id as string, {
          id: s.id as string,
          date: s.date as string
        });
      }

      // 3. Muscle injections for those sessions.
      const sessionIds = (sessionRows ?? []).map((s) => s.id as string);
      const injectionsBySession = new Map<
        string,
        { muscle: string; dose: number }[]
      >();
      if (sessionIds.length > 0) {
        const { data: injRows, error: iErr } = await supabase
          .from('muscle_injection')
          .select('treatment_session_id, muscle, dose_units')
          .in('treatment_session_id', sessionIds);
        if (iErr) throw iErr;
        for (const inj of injRows ?? []) {
          const sid = inj.treatment_session_id as string;
          const list = injectionsBySession.get(sid) ?? [];
          list.push({
            muscle: inj.muscle as string,
            dose: Number(inj.dose_units)
          });
          injectionsBySession.set(sid, list);
        }
      }

      // 4. All goal ratings, joined to cycle + week, to find each
      //    cycle's peak and fade week.
      const { data: ratingRows, error: rErr } = await supabase
        .from('weekly_goal_rating')
        .select(
          'rating_value, weekly_checkin:weekly_checkin_id (treatment_cycle_id, week_number)'
        );
      if (rErr) throw rErr;

      // Per cycle: week_number -> list of GAS values for that week.
      const weeksByCycle = new Map<string, Map<number, number[]>>();
      for (const r of ratingRows ?? []) {
        const ci = Array.isArray(r.weekly_checkin)
          ? r.weekly_checkin[0]
          : r.weekly_checkin;
        if (!ci) continue;
        const cycleId = ci.treatment_cycle_id as string;
        if (!cycleIds.includes(cycleId)) continue;
        const value = r.rating_value as number | null;
        if (value === null || value === undefined) continue;
        const week = ci.week_number as number;
        const wkMap = weeksByCycle.get(cycleId) ?? new Map<number, number[]>();
        const list = wkMap.get(week) ?? [];
        list.push(value);
        wkMap.set(week, list);
        weeksByCycle.set(cycleId, wkMap);
      }

      // Build per-cycle analysis.
      const cycles: CycleAnalysis[] = cycleRows.map((c, idx) => {
        const cycleId = c.id as string;
        const wkMap = weeksByCycle.get(cycleId);

        let peakGas: number | null = null;
        let fadeWeek: number | null = null;
        let benefitHeld = false;

        if (wkMap && wkMap.size > 0) {
          // Average each week's ratings (a cycle may have >1 goal),
          // then sort weeks ascending.
          const weekAvgs: { week: number; gas: number }[] = [];
          for (const [week, values] of wkMap) {
            const avg =
              values.reduce((a, b) => a + b, 0) / values.length;
            weekAvgs.push({ week, gas: avg });
          }
          weekAvgs.sort((a, b) => a.week - b.week);

          peakGas = Math.max(...weekAvgs.map((w) => w.gas));
          // Fade week: walking forward from the peak, the last week
          // still within FADE_THRESHOLD of peak. If the rating never
          // drops that far, benefit held.
          const peakIndex = weekAvgs.findIndex((w) => w.gas === peakGas);
          let lastWithinThreshold = weekAvgs[peakIndex].week;
          let faded = false;
          for (let i = peakIndex + 1; i < weekAvgs.length; i++) {
            if ((peakGas as number) - weekAvgs[i].gas >= FADE_THRESHOLD) {
              faded = true;
              break;
            }
            lastWithinThreshold = weekAvgs[i].week;
          }
          if (faded) {
            fadeWeek = lastWithinThreshold;
          } else {
            benefitHeld = true;
            fadeWeek = null;
          }
          // Round peak to one decimal for display.
          peakGas = Math.round(peakGas * 10) / 10;
        }

        // Weeks to the next cycle's treatment.
        let weeksToNextTreatment: number | null = null;
        const thisSession = sessionByCycle.get(cycleId);
        const nextCycle = cycleRows[idx + 1];
        if (thisSession && nextCycle) {
          const nextSession = sessionByCycle.get(nextCycle.id as string);
          if (nextSession) {
            const d1 = new Date(thisSession.date).getTime();
            const d2 = new Date(nextSession.date).getTime();
            weeksToNextTreatment = Math.round(
              (d2 - d1) / (1000 * 60 * 60 * 24 * 7)
            );
          }
        }

        return {
          cycleId,
          cycleNumber: c.cycle_number as number,
          startDate: c.start_date as string,
          peakGas,
          fadeWeek,
          benefitHeld,
          weeksToNextTreatment
        };
      });

      // Per-muscle dose trends. Collect dose per muscle per cycle,
      // then keep only muscles seen in 2+ cycles.
      const muscleToPoints = new Map<string, MuscleDosePoint[]>();
      for (const c of cycleRows) {
        const session = sessionByCycle.get(c.id as string);
        if (!session) continue;
        const injections = injectionsBySession.get(session.id) ?? [];
        // A muscle could appear twice in one cycle (both sides) — sum.
        const doseByMuscle = new Map<string, number>();
        for (const inj of injections) {
          doseByMuscle.set(
            inj.muscle,
            (doseByMuscle.get(inj.muscle) ?? 0) + inj.dose
          );
        }
        for (const [muscle, dose] of doseByMuscle) {
          const pts = muscleToPoints.get(muscle) ?? [];
          pts.push({ cycleNumber: c.cycle_number as number, doseUnits: dose });
          muscleToPoints.set(muscle, pts);
        }
      }
      const muscleTrends: MuscleDoseTrend[] = [];
      for (const [muscle, points] of muscleToPoints) {
        if (points.length >= 2) {
          points.sort((a, b) => a.cycleNumber - b.cycleNumber);
          muscleTrends.push({ muscle, points });
        }
      }
      muscleTrends.sort((a, b) => a.muscle.localeCompare(b.muscle));

      return { patientId, cycles, muscleTrends };
    }
  });
}
