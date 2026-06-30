'use client';

import type { SubmitCheckinInput } from './supabase/checkin';

/**
 * A small, durable queue of check-in submits that couldn't reach the server
 * (e.g. the connection dropped). Backed by localStorage so it survives a tab
 * close or refresh — matching the existing check-in draft store. Entries are
 * small (ratings + comment + training days), well within quota.
 *
 * NOTE: this stores patient-entered check-in data on the device until it
 * syncs. It's scoped to the signed-in patient's own in-flight submits and
 * cleared on success, but it is patient data at rest — flag for the DPIA
 * before real patient data (see HANDOVER).
 */

const KEY = 'treatment-companion:v1:checkin-outbox';

export interface OutboxEntry {
  id: string;
  promptId: string;
  input: SubmitCheckinInput;
  queuedAt: string;
}

function read(): OutboxEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

function write(list: OutboxEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore quota / serialization errors
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/** Queues a submit. One entry per prompt — re-queuing the same prompt
 *  replaces the prior entry (the latest answers win). */
export function enqueueCheckin(input: SubmitCheckinInput): OutboxEntry {
  const entry: OutboxEntry = {
    id: newId(),
    promptId: input.promptId,
    input,
    queuedAt: new Date().toISOString()
  };
  write([...read().filter((e) => e.promptId !== input.promptId), entry]);
  return entry;
}

export function listCheckinOutbox(): OutboxEntry[] {
  return read();
}

export function removeCheckinOutbox(id: string): void {
  write(read().filter((e) => e.id !== id));
}

export function checkinOutboxCount(): number {
  return read().length;
}
