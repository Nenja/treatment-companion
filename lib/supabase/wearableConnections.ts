'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

/**
 * Client layer for wearable-aggregator connections (migration 0120).
 * Reads are governed by RLS (a patient sees only their own connections), so
 * no patient id is needed here. Writes that touch the aggregator go through
 * the /api/wearables/* route handlers (which hold the server credentials).
 */

export type WearableConnectionStatus =
  | 'pending'
  | 'connected'
  | 'revoked'
  | 'error';

export interface WearableConnection {
  id: string;
  provider: string;
  aggregator: string;
  status: WearableConnectionStatus;
  connectedAt: string | null;
  lastSyncAt: string | null;
  revokedAt: string | null;
}

/** True only when the public feature flag is on. */
export function wearablesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WEARABLES_ENABLED === 'true';
}

/** The signed-in patient's own wearable connections (RLS-scoped). */
export function useWearableConnections(enabled = true) {
  return useQuery({
    queryKey: ['wearableConnections'],
    enabled: enabled && wearablesEnabled(),
    queryFn: async (): Promise<WearableConnection[]> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('wearable_connection')
        .select(
          'id, provider, aggregator, status, connected_at, last_sync_at, revoked_at'
        )
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        provider: r.provider as string,
        aggregator: r.aggregator as string,
        status: r.status as WearableConnectionStatus,
        connectedAt: (r.connected_at as string | null) ?? null,
        lastSyncAt: (r.last_sync_at as string | null) ?? null,
        revokedAt: (r.revoked_at as string | null) ?? null
      }));
    }
  });
}

/**
 * Starts a connection: asks our API for a hosted connect URL, then redirects
 * the browser to it. (Consent is recorded server-side when the row is created.)
 */
export function useConnectWearable() {
  return useMutation({
    mutationFn: async (args?: { provider?: string }): Promise<void> => {
      const res = await fetch('/api/wearables/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args ?? {})
      });
      if (!res.ok) {
        throw new Error(`connect failed: ${res.status}`);
      }
      const data = (await res.json()) as { url?: string };
      if (!data.url) throw new Error('no connect URL');
      window.location.href = data.url;
    }
  });
}

/** Revokes a connection. */
export function useDisconnectWearable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (connectionId: string): Promise<void> => {
      const res = await fetch('/api/wearables/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId })
      });
      if (!res.ok) throw new Error(`disconnect failed: ${res.status}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wearableConnections'] });
    }
  });
}
