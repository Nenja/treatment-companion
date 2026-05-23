'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface AdminAccount {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isAdmin: boolean;
  createdAt: string;
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
