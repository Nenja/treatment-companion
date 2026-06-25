'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

/**
 * Clinician-facing questionnaire hooks (migrations 0114 + 0115).
 *
 * The clinician picks PUBLISHED questionnaires from the admin-curated library
 * and enables them per patient with a cadence; admins publish and create.
 * All access control lives in the SECURITY DEFINER RPCs; these are thin typed
 * wrappers over them.
 *
 * NOTE on typing: these RPCs are added by 0114/0115. Until `lib/database.types`
 * is regenerated against the updated schema, the generated client doesn't know
 * them, so we call through a narrow local `rpc` type. Once types are
 * regenerated, the `RpcFn` casts can be removed in favour of the generated
 * overloads.
 */

type RpcFn = (
  fn: string,
  args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;

export type ScheduleKind =
  | 'baseline'
  | 'every_checkin'
  | 'every_n_checkins'
  | 'first_of_cycle'
  | 'monthly'
  | 'specific_weeks';

export interface LibraryQuestionnaire {
  questionnaire_id: string;
  key: string;
  title: string;
  description: string | null;
  lang: string;
  item_count: number;
}

export interface PatientQuestionnaire {
  assignment_id: string;
  questionnaire_key: string;
  title: string | null;
  lang: string | null;
  schedule_kind: ScheduleKind;
  schedule_n: number | null;
  schedule_weeks: number[] | null;
  active: boolean;
  /** 'patient' = enabled for this patient; 'study' = via a study (read-only here). */
  source: 'patient' | 'study';
}

/** The published library, latest active version per key. Care-pro / admin only. */
export function useLibraryQuestionnaires(lang?: string | null) {
  return useQuery({
    queryKey: ['questionnaireLibrary', lang ?? null],
    queryFn: async (): Promise<LibraryQuestionnaire[]> => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await (sb as unknown as { rpc: RpcFn }).rpc(
        'list_library_questionnaires',
        { p_lang: lang ?? null }
      );
      if (error) throw new Error(error.message);
      return (data as LibraryQuestionnaire[] | null) ?? [];
    }
  });
}

/** What's enabled for one patient (patient-level + study-level that reach them). */
export function usePatientQuestionnaires(patientId: string | null) {
  return useQuery({
    queryKey: ['patientQuestionnaires', patientId],
    enabled: !!patientId,
    queryFn: async (): Promise<PatientQuestionnaire[]> => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await (sb as unknown as { rpc: RpcFn }).rpc(
        'list_patient_questionnaires',
        { p_patient_id: patientId }
      );
      if (error) throw new Error(error.message);
      return (data as PatientQuestionnaire[] | null) ?? [];
    }
  });
}

export interface AssignQuestionnaireInput {
  patientId: string;
  questionnaireKey: string;
  scheduleKind: ScheduleKind;
  scheduleN?: number | null;
  scheduleWeeks?: number[] | null;
}

/** Enable a published questionnaire for a patient with a cadence. */
export function useAssignQuestionnaire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AssignQuestionnaireInput): Promise<string> => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await (sb as unknown as { rpc: RpcFn }).rpc(
        'assign_questionnaire',
        {
          p_questionnaire_key: input.questionnaireKey,
          p_schedule_kind: input.scheduleKind,
          p_study_id: null,
          p_patient_id: input.patientId,
          p_schedule_n: input.scheduleN ?? null,
          p_schedule_weeks: input.scheduleWeeks ?? null
        }
      );
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: (_id, input) => {
      qc.invalidateQueries({ queryKey: ['patientQuestionnaires', input.patientId] });
    }
  });
}

/** Stop or restart an enabled questionnaire for a patient. */
export function useSetAssignmentActive(patientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      assignmentId: string;
      active: boolean;
    }): Promise<void> => {
      const sb = createSupabaseBrowserClient();
      const { error } = await (sb as unknown as { rpc: RpcFn }).rpc(
        'set_questionnaire_assignment_active',
        { p_assignment_id: input.assignmentId, p_active: input.active }
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patientQuestionnaires', patientId] });
    }
  });
}

// --- Patient-side: render a due questionnaire on the post-checkin screen ----

export interface DueQuestionnaire {
  questionnaire_id: string;
  questionnaire_key: string;
  title: string;
  lang: string;
  assignment_id: string | null;
}

export type ItemType =
  | 'likert'
  | 'nrs_0_10'
  | 'single_choice'
  | 'multi_choice'
  | 'number'
  | 'text'
  | 'boolean';

export interface QuestionnaireItem {
  id: string;
  item_key: string;
  position: number;
  prompt: string;
  item_type: ItemType;
  required: boolean;
  options: { value: string; label: string }[] | null;
  min_value: number | null;
  max_value: number | null;
}

// Narrow typed accessors for the new tables/functions (pending types regen).
type PgErr = { message: string } | null;
interface QueryResult {
  data: unknown;
  error: PgErr;
}
interface FilterBuilder extends PromiseLike<QueryResult> {
  eq: (col: string, val: unknown) => FilterBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => FilterBuilder;
}
interface SelectBuilder {
  select: (cols: string) => FilterBuilder;
}
function fromTable(
  sb: ReturnType<typeof createSupabaseBrowserClient>,
  table: string
): SelectBuilder {
  return (sb as unknown as { from: (t: string) => SelectBuilder }).from(table);
}

/** Which questionnaires this check-in should collect (resolved by schedule). */
export function useDueQuestionnaires(weeklyCheckinId: string | null) {
  return useQuery({
    queryKey: ['dueQuestionnaires', weeklyCheckinId],
    enabled: !!weeklyCheckinId,
    queryFn: async (): Promise<DueQuestionnaire[]> => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await (sb as unknown as { rpc: RpcFn }).rpc(
        'due_questionnaires_for_checkin',
        { p_weekly_checkin_id: weeklyCheckinId }
      );
      if (error) throw new Error(error.message);
      return (data as DueQuestionnaire[] | null) ?? [];
    }
  });
}

/** The items (questions) of a questionnaire version, in display order. */
export function useQuestionnaireItems(questionnaireId: string | null) {
  return useQuery({
    queryKey: ['questionnaireItems', questionnaireId],
    enabled: !!questionnaireId,
    queryFn: async (): Promise<QuestionnaireItem[]> => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await fromTable(sb, 'questionnaire_item')
        .select(
          'id,item_key,position,prompt,item_type,required,options,min_value,max_value'
        )
        .eq('questionnaire_id', questionnaireId)
        .order('position', { ascending: true });
      if (error) throw new Error(error.message);
      return (data as QuestionnaireItem[] | null) ?? [];
    }
  });
}

export interface SubmitQuestionnaireInput {
  questionnaireId: string;
  answers: { item_key: string; value: string }[];
  weeklyCheckinId?: string | null;
  assignmentId?: string | null;
  filledBy?: 'patient' | 'caregiver';
}

/** Submit a completed questionnaire (raw answers). */
export function useSubmitQuestionnaireResponse() {
  return useMutation({
    mutationFn: async (input: SubmitQuestionnaireInput): Promise<string> => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await (sb as unknown as { rpc: RpcFn }).rpc(
        'submit_questionnaire_response',
        {
          p_questionnaire_id: input.questionnaireId,
          p_answers: input.answers,
          p_weekly_checkin_id: input.weeklyCheckinId ?? null,
          p_assignment_id: input.assignmentId ?? null,
          p_patient_id: null,
          p_filled_by: input.filledBy ?? 'patient'
        }
      );
      if (error) throw new Error(error.message);
      return data as string;
    }
  });
}

// --- Admin authoring + library publishing ----------------------------------

export interface AdminQuestionnaire {
  questionnaireId: string;
  key: string;
  title: string;
  version: number;
  lang: string;
  licensed: boolean;
  published: boolean;
}

/** All questionnaires (latest active version per key) + library publish state.
 *  Admin-only (relies on the admin RLS on questionnaire / questionnaire_library). */
export function useAdminQuestionnaires(enabled: boolean) {
  return useQuery({
    queryKey: ['adminQuestionnaires'],
    enabled,
    queryFn: async (): Promise<AdminQuestionnaire[]> => {
      const sb = createSupabaseBrowserClient();
      const [qRes, libRes] = await Promise.all([
        fromTable(sb, 'questionnaire').select('id,key,version,title,lang,licensed,is_active'),
        fromTable(sb, 'questionnaire_library').select('key,published')
      ]);
      if (qRes.error) throw new Error(qRes.error.message);
      if (libRes.error) throw new Error(libRes.error.message);
      const rows =
        (qRes.data as {
          id: string; key: string; version: number;
          title: string; licensed: boolean; is_active: boolean;
          lang: string;
        }[] | null) ?? [];
      const lib = (libRes.data as { key: string; published: boolean }[] | null) ?? [];
      const pub = new Map(lib.map((l) => [l.key, l.published]));
      const latest = new Map<string, AdminQuestionnaire>();
      for (const r of rows) {
        if (!r.is_active) continue;
        const cur = latest.get(r.key);
        if (!cur || r.version > cur.version) {
          latest.set(r.key, {
            questionnaireId: r.id,
            key: r.key,
            title: r.title,
            version: r.version,
            lang: r.lang,
            licensed: r.licensed,
            published: pub.get(r.key) ?? false
          });
        }
      }
      return [...latest.values()].sort((a, b) => a.title.localeCompare(b.title));
    }
  });
}

export interface CreateQuestionnaireItemInput {
  item_key?: string;
  prompt: string;
  item_type: ItemType;
  required: boolean;
  options?: { value: string; label: string }[];
  min_value?: number;
  max_value?: number;
}
export interface CreateQuestionnaireInput {
  key: string;
  title: string;
  description?: string | null;
  items: CreateQuestionnaireItemInput[];
  licensed?: boolean;
  sourceNote?: string | null;
  publish?: boolean;
  lang?: string;
}

/** Create a new questionnaire version + items, optionally publishing it. Admin only. */
export function useCreateQuestionnaire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateQuestionnaireInput): Promise<string> => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await (sb as unknown as { rpc: RpcFn }).rpc(
        'create_questionnaire',
        {
          p_key: input.key,
          p_title: input.title,
          p_description: input.description ?? null,
          p_items: input.items,
          p_licensed: input.licensed ?? false,
          p_source_note: input.sourceNote ?? null,
          p_publish: input.publish ?? true,
          p_lang: input.lang ?? 'en'
        }
      );
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminQuestionnaires'] });
      qc.invalidateQueries({ queryKey: ['questionnaireLibrary'] });
    }
  });
}

/** Publish or unpublish a questionnaire key in the clinician library. Admin only. */
export function useSetLibraryVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { key: string; published: boolean }): Promise<void> => {
      const sb = createSupabaseBrowserClient();
      const { error } = await (sb as unknown as { rpc: RpcFn }).rpc(
        'set_library_visibility',
        { p_key: input.key, p_published: input.published }
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminQuestionnaires'] });
      qc.invalidateQueries({ queryKey: ['questionnaireLibrary'] });
    }
  });
}
