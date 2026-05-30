'use client';

/**
 * Birthdate picker as three explicit dropdowns: day, month, year.
 *
 * Why not <input type="date">: native date inputs render and behave
 * inconsistently across browsers (notably on Firefox/Windows, the
 * audience here), and the picker can hide day selection behind a
 * month/year view that users miss. Three plain selects make day, month
 * and year all obviously selectable, work identically everywhere, and
 * are easier for an older patient group on a phone.
 *
 * Value is an ISO date string 'YYYY-MM-DD' (the same shape the rest of
 * the app and the date column use), or '' when incomplete. onChange
 * fires with '' until all three parts are chosen, so a partial date is
 * never treated as set.
 */

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function daysInMonth(year: number, month1to12: number): number {
  // Day 0 of the next month = last day of this month.
  return new Date(year, month1to12, 0).getDate();
}

export function BirthdatePicker({
  value,
  onChange,
  monthLabels,
  labels,
  maxYear = new Date().getFullYear(),
  minYear = 1900
}: {
  value: string; // 'YYYY-MM-DD' or ''
  onChange: (iso: string) => void;
  /** 12 localized month names, January→December. Falls back to English. */
  monthLabels?: string[];
  /** Placeholder labels for each dropdown. */
  labels: { day: string; month: string; year: string };
  maxYear?: number;
  minYear?: number;
}) {
  const months = monthLabels && monthLabels.length === 12 ? monthLabels : MONTHS_EN;

  // Parse the current value (if any) into parts.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  const year = m ? parseInt(m[1], 10) : null;
  const month = m ? parseInt(m[2], 10) : null; // 1..12
  const day = m ? parseInt(m[3], 10) : null;

  // How many days the chosen month/year allows (defaults to 31 until
  // month+year are known, so the day list is always usable).
  const dayCount =
    year !== null && month !== null ? daysInMonth(year, month) : 31;

  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y--) years.push(y);

  const emit = (d: number | null, mo: number | null, y: number | null) => {
    if (d && mo && y) {
      // Clamp day to the month's length (e.g. switching to February).
      const maxD = daysInMonth(y, mo);
      const dd = Math.min(d, maxD);
      onChange(
        `${y}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
      );
    } else {
      onChange('');
    }
  };

  const selectClass =
    'block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-2 py-2 text-[14px] text-ink focus:border-sage focus:outline-none';

  return (
    <div className="flex gap-2">
      {/* Day */}
      <select
        aria-label={labels.day}
        value={day ?? ''}
        onChange={(e) =>
          emit(e.target.value ? parseInt(e.target.value, 10) : null, month, year)
        }
        className={selectClass}
      >
        <option value="">{labels.day}</option>
        {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      {/* Month */}
      <select
        aria-label={labels.month}
        value={month ?? ''}
        onChange={(e) =>
          emit(day, e.target.value ? parseInt(e.target.value, 10) : null, year)
        }
        className={`${selectClass} flex-[1.4]`}
      >
        <option value="">{labels.month}</option>
        {months.map((name, i) => (
          <option key={i} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      {/* Year */}
      <select
        aria-label={labels.year}
        value={year ?? ''}
        onChange={(e) =>
          emit(day, month, e.target.value ? parseInt(e.target.value, 10) : null)
        }
        className={selectClass}
      >
        <option value="">{labels.year}</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
