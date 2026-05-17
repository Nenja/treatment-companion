'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for use in client components ('use client').
 *
 * Reads connection details from environment variables set in Vercel:
 *   - NEXT_PUBLIC_SUPABASE_URL          — project URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY     — anon public key (safe to expose)
 *
 * The NEXT_PUBLIC_ prefix is what makes these accessible in browser code.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
