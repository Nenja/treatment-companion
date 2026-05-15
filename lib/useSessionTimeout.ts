'use client';

import { useEffect, useRef } from 'react';
import { useStore } from './store';

const TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

interface Options {
  onTimeout: () => void;
}

/**
 * Watches the clinician session and fires `onTimeout` if the
 * `lastActivityAt` timestamp falls more than TIMEOUT_MS behind now.
 *
 * Checked every 30 seconds while mounted. Refresh the session by calling
 * `actions.touchClinicianSession()` on any meaningful clinician action.
 */
export function useSessionTimeout({ onTimeout }: Options) {
  const state = useStore();
  const session = state.clinicianSession;
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      const last = new Date(session.lastActivityAt).getTime();
      if (Date.now() - last > TIMEOUT_MS) {
        onTimeoutRef.current();
      }
    }, 30 * 1000);
    return () => clearInterval(interval);
  }, [session]);
}
