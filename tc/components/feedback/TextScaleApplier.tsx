'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/supabase/auth';

/**
 * Applies the signed-in profile's text_scale preference as a CSS
 * variable on the document root. Mount once near the top of the tree
 * (after AuthProvider). All Tailwind text-[Npx] classes inherit from
 * the body font-size, which uses calc(17px * var(--text-scale)).
 *
 * If not signed in, defaults to 1.0 (the CSS itself uses 1.0 as the
 * fallback so this only has to set when there's a profile).
 */
export function TextScaleApplier() {
  const { profile } = useAuth();
  useEffect(() => {
    const scale = profile?.textScale ?? 1.0;
    document.documentElement.style.setProperty(
      '--text-scale',
      String(scale)
    );
  }, [profile?.textScale]);
  return null;
}
