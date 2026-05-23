'use client';

/**
 * GAS cut-points editor.
 *
 * Goal Attainment Scaling maps the patient's weekly 0-10 NRS answer
 * onto five outcome levels (-2..+2). The physician sets four cut
 * points that draw the boundaries between those five levels.
 *
 * The earlier UI showed four boxes labelled cut₁..cut₄ plus a formula
 * ("NRS ≤ cut₁ → -2; ≤ cut₂ → -1; ..."). That asked the physician to
 * hold the whole mapping in their head. This component instead shows
 * the five GAS levels as named rows — each with its plain meaning, its
 * GAS number, and the NRS range it covers — and puts the cut input on
 * the row whose upper boundary it sets. The mapping is then readable
 * top to bottom with nothing to decode.
 *
 * The stored model is unchanged: four integers cutLowLow < cutLow <
 * cutZero < cutHigh, each 0-9. Direction only flips which GAS number a
 * row carries; the cut values themselves are always ascending NRS.
 */

interface GasCutPointsProps {
  direction: 'higherIsBetter' | 'lowerIsBetter';
  cutLowLow: string;
  cutLow: string;
  cutZero: string;
  cutHigh: string;
  onChange: (which: 'lowLow' | 'low' | 'zero' | 'high', v: string) => void;
}

// Plain-language meaning of each GAS level. These are the standard
// Goal Attainment Scaling descriptions.
const GAS_MEANING: Record<-2 | -1 | 0 | 1 | 2, string> = {
  [-2]: 'Much less than expected',
  [-1]: 'Somewhat less than expected',
  [0]: 'The expected outcome',
  [1]: 'Somewhat more than expected',
  [2]: 'Much more than expected'
};

export function GasCutPoints({
  direction,
  cutLowLow,
  cutLow,
  cutZero,
  cutHigh,
  onChange
}: GasCutPointsProps) {
  const higher = direction === 'higherIsBetter';

  // The five rows, lowest NRS band first. For higher-is-better the
  // lowest NRS band is the worst outcome (-2); for lower-is-better the
  // lowest NRS band is the best outcome (+2). Only the lower four
  // bands have a cut input — the top band is "everything above".
  const gasFor = (bandFromBottom: 0 | 1 | 2 | 3 | 4): -2 | -1 | 0 | 1 | 2 => {
    const ladder: (-2 | -1 | 0 | 1 | 2)[] = higher
      ? [-2, -1, 0, 1, 2]
      : [2, 1, 0, -1, -2];
    return ladder[bandFromBottom];
  };

  const num = (s: string) => (s === '' ? null : Number(s));
  const c1 = num(cutLowLow);
  const c2 = num(cutLow);
  const c3 = num(cutZero);
  const c4 = num(cutHigh);

  // Human-readable NRS range for each band, given the current cuts.
  const range = (lower: number | null, upper: number | null): string => {
    if (upper === null) {
      return lower === null ? 'NRS —' : `NRS ${lower + 1} and above`;
    }
    if (lower === null) return `NRS 0–${upper}`;
    if (lower + 1 > upper) return `NRS ${upper}`;
    return `NRS ${lower + 1}–${upper}`;
  };

  const rows: {
    band: 0 | 1 | 2 | 3 | 4;
    rangeText: string;
    cut: { key: 'lowLow' | 'low' | 'zero' | 'high'; value: string } | null;
  }[] = [
    {
      band: 0,
      rangeText: range(null, c1),
      cut: { key: 'lowLow', value: cutLowLow }
    },
    {
      band: 1,
      rangeText: range(c1, c2),
      cut: { key: 'low', value: cutLow }
    },
    {
      band: 2,
      rangeText: range(c2, c3),
      cut: { key: 'zero', value: cutZero }
    },
    {
      band: 3,
      rangeText: range(c3, c4),
      cut: { key: 'high', value: cutHigh }
    },
    { band: 4, rangeText: range(c4, null), cut: null }
  ];

  return (
    <div className="mt-2 space-y-2">
      {rows.map((row) => {
        const gas = gasFor(row.band);
        const gasLabel = gas > 0 ? `+${gas}` : String(gas);
        return (
          <div
            key={row.band}
            className="flex items-center gap-3 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5"
          >
            {/* GAS number badge */}
            <span
              className={`flex h-8 w-9 shrink-0 items-center justify-center rounded-md text-[14px] font-bold tabular-nums ${
                gas === 0
                  ? 'bg-stone text-ink'
                  : gas > 0
                    ? 'bg-sage-soft text-sage-deep'
                    : 'bg-amber-soft text-amber-deep'
              }`}
            >
              {gasLabel}
            </span>

            {/* Meaning + the NRS range this band covers */}
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold leading-snug text-ink">
                {GAS_MEANING[gas]}
              </p>
              <p className="text-[13px] text-ink-muted">{row.rangeText}</p>
            </div>

            {/* Cut input — the upper NRS bound of this band. The top
                band has none (it's open-ended). */}
            {row.cut ? (
              <label className="flex shrink-0 flex-col items-end">
                <span className="text-[11px] uppercase tracking-wider text-ink-muted">
                  up to
                </span>
                <input
                  type="number"
                  min={0}
                  max={9}
                  step={1}
                  value={row.cut.value}
                  onChange={(e) =>
                    onChange(row.cut!.key, e.target.value)
                  }
                  aria-label={`Highest NRS for "${GAS_MEANING[gas]}"`}
                  className="mt-0.5 w-14 rounded-[var(--radius-button)] border border-stone bg-cream px-2 py-1.5 text-center text-[16px] font-semibold tabular-nums text-ink focus:border-sage focus:outline-none"
                />
              </label>
            ) : (
              <span className="w-14 shrink-0" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}
