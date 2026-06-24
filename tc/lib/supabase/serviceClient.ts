import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Creates a Supabase client with the service role key for admin
 * operations (creating users, listing all profiles, etc.).
 *
 * Must only be used from server-side code — the service role key
 * bypasses RLS and grants full database access. Never expose it to
 * the browser.
 *
 * The key comes from SUPABASE_SERVICE_ROLE_KEY (Vercel env var,
 * server-only — no NEXT_PUBLIC_ prefix). The URL reuses the public
 * one since it's the same project.
 */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY env var (set in Vercel)'
    );
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
