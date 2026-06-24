'use client';

interface Pt { week: number; gas: number; }

export function GoalSparkline({ points, peakWeek, fadeWeek, width = 184, height = 38 }: {
  points: Pt[]; peakWeek?: number | null; fadeWeek?: number | null; width?: number; height?: number;
}) {
  if (points.length === 0) return null;
  const pad = 5;
  const xs = points.map((p) => p.week);
  const minW = Math.min(...xs), maxW = Math.max(...xs);
  const spanW = Math.max(1, maxW - minW);
  const x = (w: number) => pad + ((w - minW) / spanW) * (width - 2 * pad);
  const y = (g: number) => pad + ((2 - g) / 4) * (height - 2 * pad);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.week).toFixed(1)} ${y(p.gas).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <line x1={pad} x2={width - pad} y1={y(0)} y2={y(0)} stroke="var(--color-stone)" strokeWidth="1" strokeDasharray="2 3" />
      {points.length > 1 && (
        <path d={d} fill="none" stroke="var(--color-sage-deep)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {points.map((p, i) => (
        <circle key={i} cx={x(p.week)} cy={y(p.gas)} r="2.6"
          fill={p.week === peakWeek ? 'var(--color-sage-deep)' : p.week === fadeWeek ? 'var(--color-amber-deep)' : 'var(--color-sage)'} />
      ))}
    </svg>
  );
}
