'use client';

import { useEffect } from 'react';
import { ensureServiceWorkerRegistered } from '@/lib/pwa';

/**
 * Registers the service worker on app load so offline caching + PWA install
 * work for every user, not only those who opted into push. Renders nothing.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    void ensureServiceWorkerRegistered();
  }, []);
  return null;
}
