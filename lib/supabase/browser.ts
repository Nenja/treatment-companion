'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Single shared Supabase client for the browser. Creating multiple
 * instances causes session-storage races and is a known antipattern
 * with @supabase/ssr.
 */
let cached: SupabaseClient | null = null;

export function createSupabaseBrowserClient(): SupabaseClient {
  if (cached) return cached;
  // TODO(types): once lib/database.types.ts is generated, type this as
  // createBrowserClient<Database>(...). See docs/DB-TYPES.md.
  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return cached;
}
