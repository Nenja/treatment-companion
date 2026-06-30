'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  listCheckinOutbox,
  removeCheckinOutbox,
  checkinOutboxCount
} from './checkinOutbox';
import {
  submitCheckinRequest,
  isAlreadySubmittedError
} from './supabase/checkin';
import { checkinDraftStorage } from './useCheckinDraft';
import { isOnline } from './offline';

/**
 * Drains the check-in outbox: replays each queued submit, removing it on
 * success — or when the server says the prompt is no longer pending, which
 * means the original actually went through (idempotent replay). A renewed
 * connection drop or an unexpected server error stops the run; the rest stays
 * queued for the next attempt. Auto-flushes on mount and whenever the browser
 * fires `online`.
 */
export function useCheckinOutbox() {
  const qc = useQueryClient();
  const [pending, setPending] = useState(0);
  const flushing = useRef(false);

  const refresh = useCallback(() => setPending(checkinOutboxCount()), []);

  const flush = useCallback(async () => {
    if (flushing.current || !isOnline()) return;
    flushing.current = true;
    try {
      for (const entry of listCheckinOutbox()) {
        try {
          await submitCheckinRequest(entry.input);
          removeCheckinOutbox(entry.id);
          checkinDraftStorage.clear(entry.promptId);
        } catch (err) {
          if (isAlreadySubmittedError(err)) {
            removeCheckinOutbox(entry.id);
            checkinDraftStorage.clear(entry.promptId);
          } else {
            // Offline again, or a server error we shouldn't hammer — stop and
            // keep the remaining entries for the next flush.
            break;
          }
        }
      }
      qc.invalidateQueries({ queryKey: ['patientHome'] });
      qc.invalidateQueries({ queryKey: ['checkin'] });
    } finally {
      flushing.current = false;
      refresh();
    }
  }, [qc, refresh]);

  useEffect(() => {
    refresh();
    void flush();
    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flush, refresh]);

  return { pending, flush };
}
