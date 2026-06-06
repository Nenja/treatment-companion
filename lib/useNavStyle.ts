'use client';

import { useAuth } from './supabase/auth';

/**
 * The user's navigation-style preference ('top' | 'side'), defaulting to
 * 'top'. Like useWideLayout this is a *preference* read, not a screen-size
 * check — a side rail is only rendered when this is 'side' AND the wide
 * layout is active AND the screen is large enough (the page gates the rail
 * behind `lg:`).
 */
export function useNavStyle(): 'top' | 'side' {
  const { profile } = useAuth();
  return profile?.navStyle === 'side' ? 'side' : 'top';
}
