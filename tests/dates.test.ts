import { describe, it, expect } from 'vitest';
import { addDaysIso, diffDays, weekOfCycle, isToday, todayIso } from '@/lib/dates';

describe('dates', () => {
  it('addDaysIso advances and rewinds calendar days (UTC)', () => {
    expect(addDaysIso('2026-01-10', 7)).toBe('2026-01-17');
    expect(addDaysIso('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28'); // 2026 is not a leap year
  });

  it('diffDays counts whole days, signed', () => {
    expect(diffDays('2026-01-10', '2026-01-17')).toBe(7);
    expect(diffDays('2026-01-17', '2026-01-10')).toBe(-7);
    expect(diffDays('2026-01-10', '2026-01-10')).toBe(0);
  });

  it('weekOfCycle is 1-based and clamps to at least 1', () => {
    expect(weekOfCycle('2026-01-10', '2026-01-10')).toBe(1); // day 0 -> week 1
    expect(weekOfCycle('2026-01-10', '2026-01-16')).toBe(1); // day 6 -> week 1
    expect(weekOfCycle('2026-01-10', '2026-01-17')).toBe(2); // day 7 -> week 2
    expect(weekOfCycle('2026-01-10', '2026-01-03')).toBe(1); // before start -> clamp
  });

  it('todayIso is a YYYY-MM-DD string and reads as today', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Same instant as now -> same local calendar date, regardless of timezone.
    expect(isToday(new Date().toISOString())).toBe(true);
    expect(isToday('1999-01-01')).toBe(false);
  });
});
