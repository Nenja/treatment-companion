import { describe, it, expect } from 'vitest';
import { buildSvg, type GoalChartInput } from '@/lib/goalChartImage';

// The PNG builder is pure: input -> SVG string. A translator stub returns its
// key; legend labels come from `input.legend`, so they appear verbatim.
const t = ((k: string) => k) as unknown as GoalChartInput['t'];
const legend = { patient: 'Patient', physio: 'Physiotherapist', clinic: 'Clinic video' };
const header = { cycleNumber: 1, startDate: '2026-01-10' };

describe('buildSvg', () => {
  it('draws patient + physiotherapist + clinic series with a 3-item legend (NRS goal)', () => {
    const svg = buildSvg({
      goalText: 'Walk',
      kind: 'nrs',
      nrsDirection: 'higherIsBetter',
      points: [
        { week: 1, gas: null, nrs: 3 },
        { week: 2, gas: null, nrs: 5 }
      ],
      physioPoints: [
        { week: 1, gas: null, nrs: 4 },
        { week: 2, gas: null, nrs: 5 }
      ],
      clinicPoints: [
        { week: 1, gas: null, nrs: 3 },
        { week: 2, gas: null, nrs: 4 }
      ],
      legend,
      header,
      t,
      locale: 'en'
    });
    expect((svg.match(/<polyline/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(svg).toContain('>Patient<');
    expect(svg).toContain('>Physiotherapist<');
    expect(svg).toContain('>Clinic video<');
  });

  it('omits comparison series and their legend rows when only the patient reported', () => {
    const svg = buildSvg({
      goalText: 'Walk',
      kind: 'nrs',
      points: [
        { week: 1, gas: null, nrs: 3 },
        { week: 2, gas: null, nrs: 5 }
      ],
      legend,
      header,
      t,
      locale: 'en'
    });
    expect((svg.match(/<polyline/g) ?? []).length).toBe(1);
    expect(svg).toContain('>Patient<');
    expect(svg).not.toContain('>Physiotherapist<');
    expect(svg).not.toContain('>Clinic video<');
  });

  it('plots the GAS field for a GAS goal (patient + clinic)', () => {
    const svg = buildSvg({
      goalText: 'Transfer',
      kind: 'gas',
      points: [
        { week: 1, gas: -1, nrs: null },
        { week: 2, gas: 1, nrs: null }
      ],
      clinicPoints: [
        { week: 1, gas: 0, nrs: null },
        { week: 2, gas: 2, nrs: null }
      ],
      legend,
      header,
      t,
      locale: 'en'
    });
    expect((svg.match(/<polyline/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(svg).toContain('>Clinic video<');
  });

  it('returns a well-formed SVG at the expected height', () => {
    const svg = buildSvg({
      goalText: 'X',
      kind: 'nrs',
      points: [{ week: 1, gas: null, nrs: 5 }],
      legend,
      header,
      t,
      locale: 'en'
    });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('height="372"');
  });
});
