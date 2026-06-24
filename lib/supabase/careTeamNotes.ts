'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

export type CareTeamNoteKind =
  | 'physicianCycle'
  | 'physicianGoal'
  | 'therapist';

export interface CareTeamNote {
  id: string;
  kind: CareTeamNoteKind;
  /** created_at, ISO. */
  date: string;
  text: string;
  /** physicianCycle only — whether the treatment was changed that visit. */
  treatmentChanged?: boolean | null;
  /** physicianGoal only — the goal the note is about. */
  goalText?: string | null;
}

/**
 * Reads the three care-team note channels for the signed-in patient and
 * merges them newest-first. RLS (migration 0096) restricts every table to
 * the patient's own rows via `patient_id = current_patient_id()`, so no
 * patient_id filter is needed here. Read-only — the patient can never write
 * to any of these tables.
 */
export function usePatientCareTeamNotes() {
  return useQuery({
    queryKey: ['careTeamNotes'],
    queryFn: async (): Promise<CareTeamNote[]> => {
      const supabase = createSupabaseBrowserClient();
      const [handoff, goalNotes, therapist] = await Promise.all([
        supabase
          .from('treatment_handoff')
          .select('id, note, treatment_changed, created_at'),
        supabase
          .from('goal_handoff_note')
          .select(
            'id, note, created_at, approved_goal:approved_goal_id (patient_facing_text)'
          ),
        supabase.from('therapist_note').select('id, body, created_at')
      ]);
      if (handoff.error) throw handoff.error;
      if (goalNotes.error) throw goalNotes.error;
      if (therapist.error) throw therapist.error;

      const notes: CareTeamNote[] = [];

      for (const h of handoff.data ?? []) {
        const note = (h.note as string | null) ?? '';
        const changed = (h.treatment_changed as boolean | null) ?? null;
        // Skip rows that carry neither a note nor a change flag.
        if (!note && changed == null) continue;
        notes.push({
          id: `h-${h.id as string}`,
          kind: 'physicianCycle',
          date: h.created_at as string,
          text: note,
          treatmentChanged: changed
        });
      }

      for (const g of goalNotes.data ?? []) {
        const goal = g.approved_goal as
          | { patient_facing_text: string | null }
          | { patient_facing_text: string | null }[]
          | null;
        const goalText = Array.isArray(goal)
          ? (goal[0]?.patient_facing_text ?? null)
          : (goal?.patient_facing_text ?? null);
        notes.push({
          id: `g-${g.id as string}`,
          kind: 'physicianGoal',
          date: g.created_at as string,
          text: g.note as string,
          goalText
        });
      }

      for (const tn of therapist.data ?? []) {
        notes.push({
          id: `t-${tn.id as string}`,
          kind: 'therapist',
          date: tn.created_at as string,
          text: tn.body as string
        });
      }

      notes.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      return notes;
    }
  });
}
