'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
