'use client';

/**
 * Stylized SVG illustrations for the onboarding wizard.
 *
 * These are deliberately simplified *representations* of features, not
 * pixel copies of the live UI — so they stay correct as the UI evolves
 * and they localise cleanly (all words are passed in as props, not
 * baked into the art). They use the app's own CSS colour tokens
 * (var(--color-…)) so they match the palette and respond to night
 * mode automatically.
 *
 * The one place we want pixel-exact, never-stale fidelity — the "tap a
 * dot" graph — is NOT here; that renders the real GoalProgressView with
 * sample data (see the wizard).
 */

/**
 * Graph-reading explainer: five outcome bands, a patient line and a
 * therapist line, a comment marker, and a skipped-week ring. All
 * labels are passed in for localisation.
 */
export function GraphBandsIllustration({
  betterLabel,
  expectedLabel,
  belowLabel,
  patientLabel,
  therapistLabel
}: {
  betterLabel: string;
  expectedLabel: string;
  belowLabel: string;
  patientLabel: string;
  therapistLabel: string;
}) {
  return (
    <svg
      viewBox="0 0 320 150"
      width="100%"
      role="img"
      aria-label={`${betterLabel}; ${expectedLabel}; ${belowLabel}`}
      className="rounded-[var(--radius-card)] border border-stone bg-cream-soft"
    >
      {/* Bands */}
      <rect
        x="8"
        y="10"
        width="220"
        height="38"
        rx="3"
        fill="var(--color-sage-soft)"
      />
      <text x="16" y="25" fontSize="10" fill="var(--color-sage-deep)">
        +2 / +1
      </text>
      <text x="16" y="39" fontSize="10" fill="var(--color-sage)">
        {betterLabel}
      </text>

      <rect
        x="8"
        y="50"
        width="220"
        height="24"
        rx="3"
        fill="var(--color-cream)"
      />
      <text x="16" y="66" fontSize="10" fill="var(--color-ink-soft)">
        0 · {expectedLabel}
      </text>

      <rect
        x="8"
        y="76"
        width="220"
        height="38"
        rx="3"
        fill="var(--color-amber-soft)"
      />
      <text x="16" y="91" fontSize="10" fill="var(--color-amber-deep)">
        −1 / −2
      </text>
      <text x="16" y="105" fontSize="10" fill="var(--color-amber-deep)">
        {belowLabel}
      </text>

      {/* Patient line (sage) */}
      <polyline
        points="44,60 84,48 124,74 214,42"
        fill="none"
        stroke="var(--color-sage)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="44" cy="60" r="4.5" fill="var(--color-sage)" />
      <circle cx="84" cy="48" r="4.5" fill="var(--color-sage)" />
      <circle cx="124" cy="74" r="4.5" fill="var(--color-sage)" />
      <circle cx="214" cy="42" r="4.5" fill="var(--color-sage)" />

      {/* Skipped-week ring */}
      <circle
        cx="174"
        cy="62"
        r="4.5"
        fill="none"
        stroke="var(--color-ink-muted)"
        strokeWidth="1.5"
      />

      {/* Therapist line (amber) */}
      <polyline
        points="84,62 214,56"
        fill="none"
        stroke="var(--color-amber-deep)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="84" cy="62" r="3.5" fill="var(--color-amber-deep)" />
      <circle cx="214" cy="56" r="3.5" fill="var(--color-amber-deep)" />

      {/* Comment marker above a dot */}
      <rect
        x="77"
        y="32"
        width="14"
        height="11"
        rx="2"
        fill="var(--color-sage-deep)"
      />

      {/* Leaders */}
      <line
        x1="214"
        y1="42"
        x2="250"
        y2="36"
        stroke="var(--color-ink-muted)"
        strokeWidth="0.5"
        strokeDasharray="3 3"
      />
      <text x="254" y="39" fontSize="10" fill="var(--color-ink-soft)">
        {patientLabel}
      </text>
      <line
        x1="214"
        y1="56"
        x2="250"
        y2="70"
        stroke="var(--color-ink-muted)"
        strokeWidth="0.5"
        strokeDasharray="3 3"
      />
      <text x="254" y="73" fontSize="10" fill="var(--color-ink-soft)">
        {therapistLabel}
      </text>

      {/* Skipped-week caption leader */}
      <line
        x1="174"
        y1="76"
        x2="174"
        y2="130"
        stroke="var(--color-ink-muted)"
        strokeWidth="0.5"
        strokeDasharray="3 3"
      />
      <text
        x="120"
        y="143"
        fontSize="10"
        fill="var(--color-ink-soft)"
      >
        ○ = week skipped
      </text>
    </svg>
  );
}

/**
 * A row of "action" buttons with a pointer, to illustrate the action
 * row (suggestions / therapist input / history / export). Labels in.
 */
export function ActionRowIllustration({ labels }: { labels: string[] }) {
  const shown = labels.slice(0, 4);
  return (
    <svg
      viewBox="0 0 320 120"
      width="100%"
      role="img"
      aria-label={shown.join(', ')}
      className="rounded-[var(--radius-card)] border border-stone bg-cream-soft"
    >
      {shown.map((label, i) => {
        const x = 12 + i * 75;
        const highlighted = i === 0;
        return (
          <g key={i}>
            <rect
              x={x}
              y="28"
              width="66"
              height="44"
              rx="8"
              fill={
                highlighted
                  ? 'var(--color-sage-soft)'
                  : 'var(--color-cream)'
              }
              stroke={
                highlighted ? 'var(--color-sage)' : 'var(--color-stone)'
              }
              strokeWidth="0.5"
            />
            <text
              x={x + 33}
              y="53"
              fontSize="10"
              textAnchor="middle"
              fill={
                highlighted
                  ? 'var(--color-sage-deep)'
                  : 'var(--color-ink-soft)'
              }
            >
              {label.length > 9 ? label.slice(0, 8) + '…' : label}
            </text>
          </g>
        );
      })}
      {/* Pointer to the first button */}
      <path
        d="M40 96 L34 84 L46 84 Z"
        fill="var(--color-ink-soft)"
      />
      <text
        x="56"
        y="100"
        fontSize="10"
        fill="var(--color-ink-soft)"
      >
        tap to open
      </text>
    </svg>
  );
}

/**
 * A simplified "record" surface — a couple of fields and a primary
 * button — to illustrate recording a treatment / progress. Labels in.
 */
export function RecordIllustration({
  fieldLabels,
  buttonLabel
}: {
  fieldLabels: string[];
  buttonLabel: string;
}) {
  const fields = fieldLabels.slice(0, 3);
  return (
    <svg
      viewBox="0 0 320 150"
      width="100%"
      role="img"
      aria-label={`${fields.join(', ')}; ${buttonLabel}`}
      className="rounded-[var(--radius-card)] border border-stone bg-cream-soft"
    >
      {fields.map((label, i) => {
        const y = 14 + i * 34;
        return (
          <g key={i}>
            <text x="14" y={y + 10} fontSize="10" fill="var(--color-ink-soft)">
              {label}
            </text>
            <rect
              x="14"
              y={y + 14}
              width="292"
              height="16"
              rx="4"
              fill="var(--color-cream)"
              stroke="var(--color-stone)"
              strokeWidth="0.5"
            />
          </g>
        );
      })}
      <rect
        x="14"
        y="120"
        width="140"
        height="22"
        rx="6"
        fill="var(--color-sage-deep)"
      />
      <text
        x="84"
        y="135"
        fontSize="10"
        textAnchor="middle"
        fill="var(--color-on-accent)"
      >
        {buttonLabel}
      </text>
    </svg>
  );
}

/**
 * Patient check-in illustration: a 0–10 scale with one value marked,
 * to show how a weekly check-in works. Labels in.
 */
export function CheckinScaleIllustration({
  lowLabel,
  highLabel
}: {
  lowLabel: string;
  highLabel: string;
}) {
  return (
    <svg
      viewBox="0 0 320 110"
      width="100%"
      role="img"
      aria-label={`${lowLabel} 0 to 10 ${highLabel}`}
      className="rounded-[var(--radius-card)] border border-stone bg-cream-soft"
    >
      {Array.from({ length: 11 }).map((_, n) => {
        const x = 18 + n * 28;
        const selected = n === 7;
        return (
          <g key={n}>
            <circle
              cx={x}
              cy="44"
              r="11"
              fill={
                selected ? 'var(--color-sage-deep)' : 'var(--color-cream)'
              }
              stroke={
                selected ? 'var(--color-sage-deep)' : 'var(--color-stone)'
              }
              strokeWidth="0.5"
            />
            <text
              x={x}
              y="48"
              fontSize="10"
              textAnchor="middle"
              fill={
                selected
                  ? 'var(--color-on-accent)'
                  : 'var(--color-ink-soft)'
              }
            >
              {n}
            </text>
          </g>
        );
      })}
      <text x="18" y="74" fontSize="10" textAnchor="middle" fill="var(--color-ink-muted)">
        0
      </text>
      <text x="18" y="88" fontSize="9" textAnchor="middle" fill="var(--color-ink-muted)">
        {lowLabel}
      </text>
      <text x="298" y="74" fontSize="10" textAnchor="middle" fill="var(--color-ink-muted)">
        10
      </text>
      <text x="298" y="88" fontSize="9" textAnchor="middle" fill="var(--color-ink-muted)">
        {highLabel}
      </text>
      {/* Pointer to the selected value */}
      <path d="M214 22 L208 12 L220 12 Z" fill="var(--color-sage-deep)" />
    </svg>
  );
}
