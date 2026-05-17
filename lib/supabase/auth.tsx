'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from 'react';
import type { User } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from './browser';

/**
 * Application-level profile fetched from the `profile` table once the
 * user is authenticated. Kept small — the auth state listener fetches
 * this in one query when the session changes.
 */
export interface AppProfile {
  id: string;
  role: 'patient' | 'clinician' | 'admin';
  displayName: string;
  preferredLocale: 'en' | 'da';
  email: string | null;
}

interface AuthState {
  /** True while the initial session fetch is in flight. */
  loading: boolean;
  /** Supabase auth user (UUID, email) — null if not signed in. */
  user: User | null;
  /** Application profile joined from the `profile` table — null if no row. */
  profile: AppProfile | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Provider that subscribes to Supabase auth state changes and exposes
 * the current user + profile to descendants.
 *
 * Mount once near the root of the app (inside the locale layout).
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let mounted = true;

    async function fetchProfile(userId: string): Promise<AppProfile | null> {
      const { data, error } = await supabase
        .from('profile')
        .select('id, role, display_name, preferred_locale, email')
        .eq('id', userId)
        .maybeSingle();
      if (error || !data) return null;
      return {
        id: data.id,
        role: data.role,
        displayName: data.display_name,
        preferredLocale: data.preferred_locale,
        email: data.email
      };
    }

    // Initial session check — runs on mount.
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const u = data.session?.user ?? null;
      setUser(u);
      setProfile(u ? await fetchProfile(u.id) : null);
      setLoading(false);
    });

    // Listen for sign-in / sign-out events.
    //
    // IMPORTANT: do NOT make Supabase calls (like fetchProfile) directly
    // inside this callback. The auth client holds a lock during the
    // callback; any nested Supabase call deadlocks and hangs silently.
    // We defer the profile fetch with setTimeout(..., 0) so it runs
    // after the callback returns and the lock releases.
    // See https://github.com/supabase/auth-js/issues/762
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        setTimeout(async () => {
          if (!mounted) return;
          const p = await fetchProfile(u.id);
          if (mounted) setProfile(p);
        }, 0);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ loading, user, profile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return ctx;
}
