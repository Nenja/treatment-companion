'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';
import { nrsToGas, type NrsConfig, type NrsDirection } from '../types';
import type { GoalOutcome } from './clinicianPatient';
import type { Etiology } from './patientInfo';

const FADE_THRESHOLD = 2;

export interface HistoryInjection { muscle: string; side: string | null; doseUnits: number; }
export interface HistoryTrajPoint { week: number; gas: number; }
export interface HistoryRater { gas: number | null; nrs: number | null; }
export interface HistoryGoal {
  id: string; text: string; kind: 'nrs' | 'gas'; status: string; outcome: GoalOutcome | null;
  points: HistoryTrajPoint[]; peakGas: number | null; peakWeek: number | null;
  fadeWeek: number | null; benefitHeld: boolean;
  patientLatest: HistoryRater | null; clinicianLatest: HistoryRater | null; physioLatest: HistoryRater | null;
}
export interface HistorySymptoms {
  painFirst: number | null; painLast: number | null;
  stiffFirst: number | null; stiffLast: number | null; sideEffectCount: number;
}
export interface HistoryCycle {
  id: string; cycleNumber: number; startDate: string; status: string;
  totalUnits: number | null; drugProduct: string | null; dilution: string | null;
  txDate: string | null; weeksToNext: number | null;
  injections: HistoryInjection[]; goals: HistoryGoal[]; symptoms: HistorySymptoms; notes: string[];
}
export interface PatientHistory { patientId: string; medCurrent: string | null; etiology: Etiology | null; etiologyDetail: string | null; cycles: HistoryCycle[]; }

function gasEquiv(ratingValue: number | null, nrsValue: number | null, cfg: NrsConfig | null): number | null {
  if (ratingValue !== null && ratingValue !== undefined) return ratingValue;
  if (nrsValue !== null && nrsValue !== undefined && cfg) return nrsToGas(nrsValue, cfg);
  return null;
}

export function usePatientHistory(patientId: string | null) {
  return useQuery({
    queryKey: ['patientHistory', patientId],
    enabled: !!patientId,
    queryFn: async (): Promise<PatientHistory | null> => {
      if (!patientId) return null;
      const supabase = createSupabaseBrowserClient();

      const [patientRes, cycleRes] = await Promise.all([
        supabase.from('patient').select('current_medication, etiology, etiology_detail').eq('id', patientId).maybeSingle(),
        supabase.from('treatment_cycle')
          .select('id, cycle_number, start_date, status, clinician_note')
          .eq('patient_id', patientId).order('cycle_number', { ascending: true })
      ]);
      if (cycleRes.error) throw cycleRes.error;
      const medCurrent = (patientRes.data?.current_medication as string | null) ?? null;
      const etiology = (patientRes.data?.etiology as Etiology | null) ?? null;
      const etiologyDetail = (patientRes.data?.etiology_detail as string | null) ?? null;
      const cycleRows = cycleRes.data ?? [];
      if (cycleRows.length === 0) return { patientId, medCurrent, etiology, etiologyDetail, cycles: [] };
      const cycleIds = cycleRows.map((c) => c.id as string);

      const [sessRes, goalRes, ciRes, handoffRes] = await Promise.all([
        supabase.from('treatment_session').select('id, treatment_cycle_id, date, drug_product, total_units, dilution').in('treatment_cycle_id', cycleIds),
        supabase.from('approved_goal').select('id, treatment_cycle_id, patient_facing_text, goal_kind, status, goal_outcome, nrs_question, nrs_direction, nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high, approved_at').eq('patient_id', patientId).order('approved_at', { ascending: true }),
        supabase.from('weekly_checkin').select('treatment_cycle_id, week_number, pain, stiffness, side_effects').in('treatment_cycle_id', cycleIds),
        supabase.from('treatment_handoff').select('treatment_cycle_id, note').in('treatment_cycle_id', cycleIds)
      ]);
      if (sessRes.error) throw sessRes.error;
      if (goalRes.error) throw goalRes.error;
      if (ciRes.error) throw ciRes.error;

      const sessionRows = sessRes.data ?? [];
      const sessionByCycle = new Map<string, Record<string, unknown>>();
      const cycleBySession = new Map<string, string>();
      for (const s of sessionRows) { sessionByCycle.set(s.treatment_cycle_id as string, s); cycleBySession.set(s.id as string, s.treatment_cycle_id as string); }
      const sessionIds = sessionRows.map((s) => s.id as string);

      const injByCycle = new Map<string, HistoryInjection[]>();
      if (sessionIds.length) {
        const injRes = await supabase.from('muscle_injection').select('treatment_session_id, muscle, side, dose_units').in('treatment_session_id', sessionIds);
        if (injRes.error) throw injRes.error;
        for (const inj of injRes.data ?? []) {
          const cyc = cycleBySession.get(inj.treatment_session_id as string); if (!cyc) continue;
          const list = injByCycle.get(cyc) ?? [];
          list.push({ muscle: inj.muscle as string, side: (inj.side as string | null) ?? null, doseUnits: Number(inj.dose_units) });
          injByCycle.set(cyc, list);
        }
      }

      const goalsByCycle = new Map<string, Record<string, unknown>[]>();
      const cfgByGoal = new Map<string, NrsConfig | null>();
      for (const g of goalRes.data ?? []) {
        const cyc = g.treatment_cycle_id as string; if (!cycleIds.includes(cyc)) continue;
        const cfg: NrsConfig | null = g.goal_kind === 'nrs' ? {
          question: (g.nrs_question as string) ?? '', direction: (g.nrs_direction as NrsDirection) ?? 'higherIsBetter',
          cutLowLow: Number(g.nrs_cut_low_low), cutLow: Number(g.nrs_cut_low), cutZero: Number(g.nrs_cut_zero), cutHigh: Number(g.nrs_cut_high)
        } : null;
        cfgByGoal.set(g.id as string, cfg);
        const list = goalsByCycle.get(cyc) ?? []; list.push(g); goalsByCycle.set(cyc, list);
      }

      const wgrRes = await supabase.from('weekly_goal_rating').select('approved_goal_id, rating_value, nrs_value, clinic_video_rating, clinic_video_nrs, weekly_checkin:weekly_checkin_id (week_number, treatment_cycle_id)');
      if (wgrRes.error) throw wgrRes.error;
      const ptsByGoal = new Map<string, Map<number, number>>();
      const patientLatestByGoal = new Map<string, { week: number; rater: HistoryRater }>();
      const clinicianLatestByGoal = new Map<string, { week: number; rater: HistoryRater }>();
      for (const r of wgrRes.data ?? []) {
        const ci = Array.isArray(r.weekly_checkin) ? r.weekly_checkin[0] : r.weekly_checkin; if (!ci) continue;
        const goalId = r.approved_goal_id as string; const cfg = cfgByGoal.get(goalId) ?? null; const week = ci.week_number as number;
        const pgas = gasEquiv((r.rating_value as number | null) ?? null, (r.nrs_value as number | null) ?? null, cfg);
        if (pgas !== null) {
          const m = ptsByGoal.get(goalId) ?? new Map<number, number>(); m.set(week, pgas); ptsByGoal.set(goalId, m);
          const pl = patientLatestByGoal.get(goalId);
          if (!pl || week >= pl.week) patientLatestByGoal.set(goalId, { week, rater: { gas: pgas, nrs: (r.nrs_value as number | null) ?? null } });
        }
        const cgas = gasEquiv((r.clinic_video_rating as number | null) ?? null, (r.clinic_video_nrs as number | null) ?? null, cfg);
        if (cgas !== null) {
          const cl = clinicianLatestByGoal.get(goalId);
          if (!cl || week >= cl.week) clinicianLatestByGoal.set(goalId, { week, rater: { gas: cgas, nrs: (r.clinic_video_nrs as number | null) ?? null } });
        }
      }

      const physioLatestByGoal = new Map<string, { date: string; rater: HistoryRater }>();
      const paRes = await supabase.from('physio_assessment').select('id, assessment_date, treatment_cycle_id').in('treatment_cycle_id', cycleIds);
      if (!paRes.error && paRes.data && paRes.data.length) {
        const paDate = new Map<string, string>(); for (const a of paRes.data) paDate.set(a.id as string, a.assessment_date as string);
        const pgrRes = await supabase.from('physio_goal_rating').select('physio_assessment_id, approved_goal_id, nrs_value, gas_value').in('physio_assessment_id', Array.from(paDate.keys()));
        for (const r of pgrRes.data ?? []) {
          const goalId = r.approved_goal_id as string; const cfg = cfgByGoal.get(goalId) ?? null; const date = paDate.get(r.physio_assessment_id as string) ?? '';
          const gas = gasEquiv((r.gas_value as number | null) ?? null, (r.nrs_value as number | null) ?? null, cfg);
          if (gas === null) continue;
          const cur = physioLatestByGoal.get(goalId);
          if (!cur || date >= cur.date) physioLatestByGoal.set(goalId, { date, rater: { gas, nrs: (r.nrs_value as number | null) ?? null } });
        }
      }

      const ciByCycle = new Map<string, Record<string, unknown>[]>();
      for (const c of ciRes.data ?? []) { const cyc = c.treatment_cycle_id as string; const l = ciByCycle.get(cyc) ?? []; l.push(c); ciByCycle.set(cyc, l); }
      const handoffByCycle = new Map<string, string[]>();
      for (const h of handoffRes.data ?? []) { if (!h.note) continue; const l = handoffByCycle.get(h.treatment_cycle_id as string) ?? []; l.push(h.note as string); handoffByCycle.set(h.treatment_cycle_id as string, l); }

      const out: HistoryCycle[] = cycleRows.map((c, idx) => {
        const cid = c.id as string; const sess = sessionByCycle.get(cid);
        const goals: HistoryGoal[] = (goalsByCycle.get(cid) ?? []).map((g) => {
          const goalId = g.id as string; const m = ptsByGoal.get(goalId);
          const points: HistoryTrajPoint[] = m ? Array.from(m.entries()).map(([week, gas]) => ({ week, gas })).sort((a, b) => a.week - b.week) : [];
          let peakGas: number | null = null, peakWeek: number | null = null, fadeWeek: number | null = null, benefitHeld = false;
          if (points.length) {
            peakGas = Math.max(...points.map((p) => p.gas));
            const pi = points.findIndex((p) => p.gas === peakGas); peakWeek = points[pi].week;
            let last = points[pi].week, faded = false;
            for (let i = pi + 1; i < points.length; i++) { if ((peakGas as number) - points[i].gas >= FADE_THRESHOLD) { faded = true; break; } last = points[i].week; }
            if (faded) fadeWeek = last; else benefitHeld = true;
          }
          const pl = patientLatestByGoal.get(goalId); const cl = clinicianLatestByGoal.get(goalId); const phl = physioLatestByGoal.get(goalId);
          return {
            id: goalId, text: g.patient_facing_text as string, kind: (g.goal_kind as 'nrs' | 'gas') ?? 'nrs',
            status: g.status as string, outcome: (g.goal_outcome as GoalOutcome | null) ?? null,
            points, peakGas, peakWeek, fadeWeek, benefitHeld,
            patientLatest: pl?.rater ?? null, clinicianLatest: cl?.rater ?? null, physioLatest: phl?.rater ?? null
          };
        });
        const cis = (ciByCycle.get(cid) ?? []).slice().sort((a, b) => (a.week_number as number) - (b.week_number as number));
        const firstCi = cis[0]; const lastCi = cis[cis.length - 1]; let sideEffectCount = 0;
        for (const ci of cis) { const se = ci.side_effects; if (Array.isArray(se) && se.length) sideEffectCount += 1; }
        const symptoms: HistorySymptoms = {
          painFirst: firstCi ? ((firstCi.pain as number | null) ?? null) : null, painLast: lastCi ? ((lastCi.pain as number | null) ?? null) : null,
          stiffFirst: firstCi ? ((firstCi.stiffness as number | null) ?? null) : null, stiffLast: lastCi ? ((lastCi.stiffness as number | null) ?? null) : null,
          sideEffectCount
        };
        let weeksToNext: number | null = null; const next = cycleRows[idx + 1];
        if (sess && next) { const ns = sessionByCycle.get(next.id as string); if (ns) weeksToNext = Math.round((new Date(ns.date as string).getTime() - new Date(sess.date as string).getTime()) / (1000 * 60 * 60 * 24 * 7)); }
        const notes: string[] = []; if (c.clinician_note) notes.push(c.clinician_note as string);
        for (const n of handoffByCycle.get(cid) ?? []) notes.push(n);
        return {
          id: cid, cycleNumber: c.cycle_number as number, startDate: c.start_date as string, status: c.status as string,
          totalUnits: sess ? Number(sess.total_units) : null, drugProduct: sess ? ((sess.drug_product as string | null) ?? null) : null,
          dilution: sess ? ((sess.dilution as string | null) ?? null) : null, txDate: sess ? (sess.date as string) : null,
          weeksToNext, injections: injByCycle.get(cid) ?? [], goals, symptoms, notes
        };
      });
      out.reverse();
      return { patientId, medCurrent, etiology, etiologyDetail, cycles: out };
    }
  });
}
