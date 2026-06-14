// All dates in the store are ISO-8601 strings (YYYY-MM-DD for day-only,
// or full ISO for timestamps). These helpers keep that contract clean.

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T00:00:00Z').getTime();
  const b = new Date(toIso + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Week number within a cycle, 1-indexed. */
export function weekOfCycle(cycleStartIso: string, nowIso: string): number {
  return Math.max(1, Math.floor(diffDays(cycleStartIso, nowIso) / 7) + 1);
}

export function formatLongDate(iso: string, locale: string): string {
  // Accept both date-only ('YYYY-MM-DD') and full ISO timestamps (e.g. a
  // row's created_at). Only synthesize midnight-UTC for the date-only
  // form; appending it to a full timestamp yields an invalid date, which
  // would make Intl.format() throw and crash the calling component.
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(d);
}

/**
 * Compact month + year, e.g. "Jan 2025". Used for axis labels on the
 * longitudinal charts, where a full date would be too wide and the
 * day-of-month does not matter for a cross-cycle view.
 */
export function formatMonthYear(iso: string, locale: string): string {
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: 'numeric'
  }).format(d);
}

/**
 * True if the given ISO timestamp falls on today's calendar date (in
 * the viewer's local timezone). Used to allow same-day typo edits to a
 * treatment record: a treatment can be corrected the day it was
 * entered, but becomes read-only afterwards.
 */
export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
