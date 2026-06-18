'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Single shared Supabase client for the browser. Creating multiple
 * instances causes session-storage races and is a known antipattern
 * with @supabase/ssr.
 */
let cached: SupabaseClient<Database> | null = null;

export function createSupabaseBrowserClient(): SupabaseClient<Database> {
  if (cached) return cached;
  cached = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return cached;
}
