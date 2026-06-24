'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { registerNativePushToken } from '@/lib/nativePush';

/**
 * Inside the native (Capacitor) app, registers this device's push token once
 * the user is signed in. Renders nothing and is a no-op in a normal browser.
 */
export function NativePushRegistrar() {
  const { user } = useAuth();
  const locale = useLocale();

  useEffect(() => {
    if (!user) return;
    void registerNativePushToken(locale === 'da' ? 'da' : 'en');
  }, [user, locale]);

  return null;
}
