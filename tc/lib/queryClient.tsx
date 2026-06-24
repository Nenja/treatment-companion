'use client';

import {
  QueryClient,
  QueryClientProvider as TanstackProvider
} from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * TanStack Query provider for data fetching, caching, and mutations.
 *
 * One client per browser tab. We construct it inside useState so the
 * same instance survives across React renders (a fresh QueryClient on
 * every render would lose all cached queries).
 */
export function QueryClientProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Refetch on window focus is loud; off by default. Pages
            // can opt in per-query if they need it.
            refetchOnWindowFocus: false,
            // Treat data as fresh for 30s — avoids over-fetching when
            // a component re-mounts.
            staleTime: 30_000,
            retry: 1
          }
        }
      })
  );
  return <TanstackProvider client={client}>{children}</TanstackProvider>;
}
