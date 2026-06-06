'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import type { User } from '@supabase/supabase-js';
import { useTranslations } from 'next-intl';
import { createSupabaseBrowserClient } from './browser';
import { useToast } from '@/components/feedback/Toast';

/**
 * Application-level profile fetched from the `profile` table once the
 * user is authenticated. Kept small — the auth state listener fetches
 * this in one query when the session changes.
 */
export interface AppProfile {
  id: string;
  role: 'patient' | 'clinician' | 'physiotherapist' | 'admin';
  displayName: string;
  preferredLocale: 'en' | 'da';
  email: string | null;
  /** Text-size multiplier: 1.00, 1.25, or 1.50. Applied as a CSS
   *  variable on <html> so every relative unit scales. */
  textScale: number;
  /** True while the account is still on its clinic-issued temporary
   *  password. The app routes such a user to set-password until they
   *  choose their own. */
  mustChangePassword: boolean;
  /** False until the user dismisses the one-time orientation panel on
   *  their main screen. */
  hasSeenIntro: boolean;
  /** Admin capability — orthogonal to role. An admin may also be a
   *  clinician, physiotherapist, or patient. */
  isAdmin: boolean;
  /** Chosen colour palette id, or null if not yet chosen (the app then
   *  uses the default palette). Legacy values are mapped at read time. */
  colorScheme: string | null;
  /** Day/night toggle. Every palette has a day and a night form. */
  nightMode: boolean;
  /** Accessibility opt-in: when true, show read-aloud (text-to-speech)
   *  controls on key patient-facing text. */
  readAloud: boolean;
  /** Profession code for non-physician professional accounts — a
   *  display label only, not a permission. Null for patients,
   *  physicians, and accounts where it was never set. */
  profession: string | null;
  /** Free-text profession, used only when profession === 'other'. */
  professionOther: string | null;
  /** Layout preference for large screens: 'wide' (two-pane) or
   *  'compact' (single-column). No effect on phones / narrow windows,
   *  which are always single-column. Defaults to 'wide'. */
  layoutPreference: 'wide' | 'compact';
  navStyle: 'top' | 'side';
}

interface AuthState {
  /** True while the initial session fetch is in flight. */
  loading: boolean;
  /** Supabase auth user (UUID, email) — null if not signed in. */
  user: User | null;
  /** Application profile joined from the `profile` table — null if no row. */
  profile: AppProfile | null;
  signOut: () => Promise<void>;
  /**
   * Re-read the profile row from the database and update the in-memory
   * profile. Call this after mutating own-profile fields (password
   * change clearing must_change_password, dismissing the intro, text
   * scale) so guards and UI see the new values without a full reload.
   */
  refreshProfile: () => Promise<void>;
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
  const toast = useToast();
  const tFeedback = useTranslations('feedback');
  // Track previous user so we can tell "logged out by user" (initial
  // mount) apart from "session expired mid-use" (was logged in, now
  // not). Only the latter deserves the expiry toast.
  const previousUserRef = useRef<User | null>(null);

  // Read the profile row for a user id. Lifted to component scope (as
  // a stable callback) so it can back both the auth-state effect and
  // the exposed refreshProfile().
  const fetchProfile = useCallback(
    async (userId: string): Promise<AppProfile | null> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('profile')
        .select(
          'id, role, display_name, preferred_locale, email, text_scale, must_change_password, has_seen_intro, is_admin, color_scheme, night_mode, read_aloud, profession, profession_other, layout_preference, nav_style'
        )
        .eq('id', userId)
        .maybeSingle();
      if (error || !data) return null;
      return {
        id: data.id,
        role: data.role,
        displayName: data.display_name,
        preferredLocale: data.preferred_locale,
        email: data.email,
        textScale: Number(data.text_scale) || 1.0,
        mustChangePassword: Boolean(data.must_change_password),
        hasSeenIntro: Boolean(data.has_seen_intro),
        isAdmin: Boolean(data.is_admin),
        colorScheme: (data.color_scheme as string | null) ?? null,
        nightMode: Boolean(data.night_mode),
        readAloud: Boolean(data.read_aloud),
        profession: (data.profession as string | null) ?? null,
        professionOther: (data.profession_other as string | null) ?? null,
        layoutPreference:
          (data.layout_preference as 'wide' | 'compact' | null) === 'compact'
            ? 'compact'
            : 'wide',
        navStyle:
          (data.nav_style as 'top' | 'side' | null) === 'side' ? 'side' : 'top'
      };
    },
    []
  );

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let mounted = true;

    // Initial session check — runs on mount.
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const u = data.session?.user ?? null;
      previousUserRef.current = u;
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
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      // Distinguish a true session expiry from a user-initiated sign-out
      // (handled in AccountMenu) and from initial mount. Only show the
      // expiry toast for TOKEN_REFRESHED failures or SIGNED_OUT events
      // that originate outside our own sign-out path.
      const wasSignedIn = previousUserRef.current !== null;
      if (wasSignedIn && !u && event !== 'SIGNED_OUT') {
        // TOKEN_REFRESHED failure or USER_DELETED with no session — show
        // a clear message instead of silently dropping the user.
        toast.error(tFeedback('errorSessionExpired'));
      }
      previousUserRef.current = u;
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
  }, [fetchProfile, toast, tFeedback]);

  // Re-read the current user's profile on demand. Used after own-row
  // mutations so guards/UI see new values without a page reload.
  const refreshProfile = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getUser();
    const u = data.user;
    setProfile(u ? await fetchProfile(u.id) : null);
  }, [fetchProfile]);

  const signOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{ loading, user, profile, signOut, refreshProfile }}
    >
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
