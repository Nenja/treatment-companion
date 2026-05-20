'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface AdminAccount {
  id: string;
  email: string;
  displayName: string;
  role: string;
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
  role: 'patient' | 'clinician';
  email: string;
  displayName: string;
  tempPassword: string;
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
