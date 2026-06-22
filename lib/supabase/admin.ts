'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

export interface AdminAccount {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isAdmin: boolean;
  createdAt: string;
  /** Set to a timestamp when the account is deactivated; null if active. */
  deactivatedAt: string | null;
  /** Profession code — therapist accounts only; null otherwise. */
  profession: string | null;
  professionOther: string | null;
}

/**
 * Lists all profiles via the /api/admin/list-accounts endpoint. Server
 * verifies the caller is a clinician.
 */
export function useAdminAccounts(enabled: boolean) {
  return useQuery({
    queryKey: ['adminAccounts'],
    enabled,
    queryFn: async (): Promise<AdminAccount[]> => {
      const res = await fetch('/api/admin/list-accounts');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ?? `List accounts failed (${res.status})`
        );
      }
      const data = await res.json();
      return data.accounts as AdminAccount[];
    }
  });
}

export interface CreateAccountInput {
  role: 'patient' | 'clinician' | 'physiotherapist';
  email: string;
  displayName: string;
  tempPassword: string;
  isAdmin: boolean;
  /** Profession code for the therapist role; null otherwise. */
  profession: string | null;
  /** Free-text profession, used only when profession === 'other'. */
  professionOther: string | null;
}

export interface CreateAccountResult {
  profileId: string;
  email: string;
  role: string;
  displayName: string;
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: CreateAccountInput
    ): Promise<CreateAccountResult> => {
      const res = await fetch('/api/admin/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ?? `Create account failed (${res.status})`
        );
      }
      return res.json() as Promise<CreateAccountResult>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminAccounts'] });
    }
  });
}

/**
 * Grants or revokes the is_admin flag on an existing account, via
 * /api/admin/set-admin. The server enforces admin-only, refuses
 * self-revoke, and refuses removing the last admin.
 */
export function useSetAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      profileId: string;
      isAdmin: boolean;
    }): Promise<void> => {
      const res = await fetch('/api/admin/set-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ?? `Update admin status failed (${res.status})`
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminAccounts'] });
    }
  });
}

/**
 * Resets an account's password to a fresh temporary one and returns it
 * so the admin can share it with the user. The user is flagged to set
 * their own password on next login. Role/permissions are unaffected.
 */
/**
 * One active access session — a professional currently able to see a
 * patient's record (via an open, non-timed-out clinician session).
 */
export interface ActiveAccessSession {
  sessionId: string;
  professionalName: string;
  professionalRole: string;
  patientName: string;
  startedAt: string;
  lastActivityAt: string;
}

/**
 * Lists currently-active access sessions for admin visibility:
 * who can see which patient's record right now. Read-only.
 */
export function useActiveAccess(enabled: boolean) {
  return useQuery({
    queryKey: ['adminActiveAccess'],
    enabled,
    queryFn: async (): Promise<ActiveAccessSession[]> => {
      const res = await fetch('/api/admin/list-access');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Load access failed (${res.status})`);
      }
      const data = await res.json();
      return data.sessions as ActiveAccessSession[];
    }
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (input: {
      profileId: string;
    }): Promise<{ tempPassword: string }> => {
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Password reset failed (${res.status})`);
      }
      return res.json();
    }
  });
}

/**
 * Edits an account's display name and (therapist accounts only)
 * profession. Role is intentionally not editable — see the
 * update-account route.
 */
export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      profileId: string;
      displayName: string;
      profession?: string | null;
      professionOther?: string | null;
    }): Promise<void> => {
      const res = await fetch('/api/admin/update-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ?? `Update account failed (${res.status})`
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminAccounts'] });
    }
  });
}

/**
 * Deactivates or reactivates an account. Reversible — keeps all data;
 * a deactivated account simply cannot sign in.
 */
export function useSetAccountStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      profileId: string;
      deactivate: boolean;
    }): Promise<void> => {
      const res = await fetch('/api/admin/set-account-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ?? `Update account status failed (${res.status})`
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminAccounts'] });
    }
  });
}

/**
 * Permanently deletes an account and all of its data. Destructive and
 * irreversible — the UI gates this behind a typed confirmation.
 */
export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { profileId: string }): Promise<void> => {
      const res = await fetch('/api/admin/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: input.profileId, confirm: true })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ?? `Delete account failed (${res.status})`
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminAccounts'] });
    }
  });
}

/**
 * Generates a reasonable temporary password: 12 chars, mix of letters
 * and digits, no ambiguous characters (0/O/1/l). Admin sees this
 * exactly once and communicates it to the new user.
 */
export function generateTempPassword(): string {
  const chars =
    'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 12; i++) {
    out += chars[buf[i] % chars.length];
  }
  return out;
}

export interface ResearchPurgeEntry {
  patientId: string;
  displayName: string | null;
  withdrawnAt: string;
}

/**
 * Admin queue of patients who WITHDREW research consent and whose
 * already-exported records have not yet been purged (migration 0098:
 * research_consent_withdrawn_at set, research_consent_purged_at null).
 * Read directly via the admin's patient RLS (patient_admin_all, 0037).
 */
export function useResearchPurgeQueue(enabled: boolean) {
  return useQuery({
    queryKey: ['researchPurgeQueue'],
    enabled,
    queryFn: async (): Promise<ResearchPurgeEntry[]> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('patient')
        .select(
          'id, research_consent_withdrawn_at, profile:profile_id (display_name)'
        )
        .not('research_consent_withdrawn_at', 'is', null)
        .is('research_consent_purged_at', null)
        .order('research_consent_withdrawn_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r): ResearchPurgeEntry => {
        const row = r as Record<string, unknown>;
        const prof = row.profile as { display_name?: string } | null;
        return {
          patientId: row.id as string,
          displayName: prof?.display_name ?? null,
          withdrawnAt: row.research_consent_withdrawn_at as string
        };
      });
    }
  });
}

/**
 * Admin confirms deletion of a withdrawn patient's already-exported
 * research records (stamps research_consent_purged_at via the
 * confirm_research_purge RPC, migration 0098).
 */
export function useConfirmResearchPurge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { patientId: string }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('confirm_research_purge', {
        p_patient_id: input.patientId
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['researchPurgeQueue'] });
    }
  });
}

// ---------------------------------------------------------------------------
// Studies (migration 0110). Study membership is orthogonal to research
// consent and does NOT change the consent-gated REDCap export; it is an
// admin grouping for picking out which consented patients are in which study.
// ---------------------------------------------------------------------------

export interface StudySummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  active: boolean;
  memberCount: number;
}

export interface StudyPatientRow {
  patientId: string;
  displayName: string | null;
  /** REDCap record_id; null when the patient is not research-consented. */
  studyCode: string | null;
  researchConsent: boolean;
  withdrawnAt: string | null;
  purgedAt: string | null;
  cycleCount: number;
  studyIds: string[];
}

export interface StudyOverview {
  studies: StudySummary[];
  patients: StudyPatientRow[];
}

/** Admin read of all studies + every consented-or-enrolled patient. */
export function useStudyOverview(enabled: boolean) {
  return useQuery({
    queryKey: ['studyOverview'],
    enabled,
    queryFn: async (): Promise<StudyOverview> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('study_overview');
      if (error) throw error;
      const raw = (data ?? {}) as {
        studies?: Record<string, unknown>[];
        patients?: Record<string, unknown>[];
      };
      return {
        studies: (raw.studies ?? []).map((s): StudySummary => ({
          id: s.id as string,
          key: s.key as string,
          name: s.name as string,
          description: (s.description as string) ?? null,
          active: Boolean(s.active),
          memberCount: Number(s.member_count ?? 0)
        })),
        patients: (raw.patients ?? []).map((p): StudyPatientRow => ({
          patientId: p.patient_id as string,
          displayName: (p.display_name as string) ?? null,
          studyCode: (p.study_code as string) ?? null,
          researchConsent: Boolean(p.research_consent),
          withdrawnAt: (p.withdrawn_at as string) ?? null,
          purgedAt: (p.purged_at as string) ?? null,
          cycleCount: Number(p.cycle_count ?? 0),
          studyIds: ((p.study_ids as string[]) ?? []).filter(Boolean)
        }))
      };
    }
  });
}

export function useCreateStudy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      key: string;
      name: string;
      description?: string | null;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('create_study', {
        p_key: input.key,
        p_name: input.name,
        p_description: input.description ?? undefined
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['studyOverview'] })
  });
}

export function useUpdateStudy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      studyId: string;
      name?: string | null;
      description?: string | null;
      active?: boolean | null;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('update_study', {
        p_study_id: input.studyId,
        p_name: input.name ?? undefined,
        p_description: input.description ?? undefined,
        p_active: input.active ?? undefined
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['studyOverview'] })
  });
}

export function useAddPatientToStudy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      studyId: string;
      patientId: string;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('add_patient_to_study', {
        p_study_id: input.studyId,
        p_patient_id: input.patientId
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['studyOverview'] })
  });
}

export function useRemovePatientFromStudy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      studyId: string;
      patientId: string;
    }): Promise<void> => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc('remove_patient_from_study', {
        p_study_id: input.studyId,
        p_patient_id: input.patientId
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['studyOverview'] })
  });
}
