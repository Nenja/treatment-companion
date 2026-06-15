import { describe, it, expect } from 'vitest';
import {
  buildEhrExport,
  type ExportTranslator
} from '@/lib/ehrExport';

// ---------------------------------------------------------------------------
// Translator stub. next-intl's `t` is just (key, values?) => string; here we
// echo the key, and when values are passed we append them as `k=v` pairs. That
// makes assertions check BOTH which message key the builder chose AND the
// numbers/labels it interpolated — without depending on any real translation.
// ---------------------------------------------------------------------------
const t: ExportTranslator = (key, values) =>
  values && Object.keys(values).length > 0
    ? `${key}(${Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')})`
    : key;

type Args = Parameters<typeof buildEhrExport>[0];

function build(over: Partial<Args> = {}): string {
  return buildEhrExport({
    cycle: { cycleNumber: 3, startDate: '2026-01-15' },
    goals: [],
    checkins: [],
    locale: 'en',
    t,
    ...over
  });
}

describe('buildEhrExport — header', () => {
  it('uses the injected-treatment header for the default (botulinum toxin) modality', () => {
    const out = build();
    expect(out).toMatch(/^headerInjected\(/); // header is always the first line
    expect(out).toContain('cycle=3');
  });

  it('uses the neutral header for a non-injection modality (baclofen pump)', () => {
    const out = build({
      cycle: { cycleNumber: 1, startDate: '2026-01-15', modality: 'baclofen_pump' }
    });
    expect(out.startsWith('header(')).toBe(true);
    expect(out).not.toContain('headerInjected(');
  });
});

describe('buildEhrExport — treatment block', () => {
  const baseTreatment: Args['treatment'] = {
    date: '2026-01-15',
    drugProduct: 'Botox',
    totalUnits: 300,
    dilution: '2.5 mL/100U',
    guidance: 'ultrasound',
    injections: [
      { muscle: 'Biceps brachii', side: 'right', doseUnits: 100 },
      { muscle: 'FCR', side: 'right', doseUnits: 200, note: 'tight' }
    ]
  };

  it('composes the summary line (product · total · dilution · guidance) and renders each injection with its note', () => {
    const out = build({ treatment: baseTreatment });
    expect(out).toContain('Botox');
    expect(out).toContain('unitsTotal(units=300)');
    expect(out).toContain('2.5 mL/100U');
    expect(out).toContain('guidance_ultrasound');
    expect(out).toContain('injectionLine(');
    expect(out).toContain('(tight)'); // free-text note is carried through
  });

  it('omits the reconciliation line when per-injection doses sum to the recorded total', () => {
    const out = build({ treatment: baseTreatment }); // 100 + 200 == 300
    expect(out).not.toContain('reconciliation(');
  });

  it('surfaces a reconciliation line when the doses do NOT sum to the total', () => {
    const out = build({
      treatment: {
        ...baseTreatment,
        totalUnits: 300,
        injections: [
          { muscle: 'Biceps brachii', side: 'right', doseUnits: 100 },
          { muscle: 'FCR', side: 'right', doseUnits: 150 } // sums to 250, not 300
        ]
      }
    });
    expect(out).toContain('reconciliation(sum=250,total=300)');
  });

  it('lists body-muscle injections before face marks', () => {
    const out = build({
      treatment: {
        ...baseTreatment,
        injections: [
          { muscle: 'Biceps brachii', side: 'left', doseUnits: 50 },
          { muscle: 'Corrugator', side: 'bilateral', doseUnits: 10, isFace: true }
        ]
      }
    });
    const bodyIdx = out.indexOf('injectionLine(');
    const faceIdx = out.indexOf('faceInjectionLine(');
    expect(bodyIdx).toBeGreaterThanOrEqual(0);
    expect(faceIdx).toBeGreaterThan(bodyIdx);
  });

  it('records that no treatment was entered when treatment is absent', () => {
    const out = build({ treatment: undefined });
    expect(out).toContain('treatmentNotRecorded');
  });
});

describe('buildEhrExport — goal response lines', () => {
  it('GAS goal: reports the peak level + achieved anchor, the end level, and a wearing-off week', () => {
    const out = build({
      goals: [
        {
          id: 'g1',
          patientFacingText: 'Reach overhead',
          kind: 'gas',
          anchors: { minus2: 'mm', minus1: 'm', zero: 'z', plus1: 'p1', plus2: 'p2' }
        }
      ],
      checkins: [
        { weekNumber: 2, ratings: [{ approvedGoalId: 'g1', ratingValue: 1, nrsValue: null }] },
        { weekNumber: 6, ratings: [{ approvedGoalId: 'g1', ratingValue: 2, nrsValue: null }] }, // peak
        { weekNumber: 10, ratings: [{ approvedGoalId: 'g1', ratingValue: 0, nrsValue: null }] }, // ≥2 drop
        { weekNumber: 12, ratings: [{ approvedGoalId: 'g1', ratingValue: 0, nrsValue: null }] }
      ]
    });
    expect(out).toContain('goalsHeading');
    expect(out).toContain('- Reach overhead');
    expect(out).toContain('gasPeakLine(week=6');
    expect(out).toContain('gasLevelMuchBetter'); // peak == +2
    expect(out).toContain('"p2"'); // the +2 anchor, quoted
    expect(out).toContain('gasEndLine(week=12');
    expect(out).toContain('gasLevelAsExpected'); // end == 0
    expect(out).toContain('wearingOffFrom(week=10)');
  });

  it('NRS goal (lowerIsBetter): best is the LOWEST score, and baseline/target + worst-scale are reported', () => {
    const out = build({
      goals: [
        {
          id: 'n1',
          patientFacingText: 'Less shoulder pain',
          kind: 'nrs',
          nrsDirection: 'lowerIsBetter',
          nrsBaseline: 8,
          nrsTarget: 3,
          anchors: null
        }
      ],
      checkins: [
        { weekNumber: 2, ratings: [{ approvedGoalId: 'n1', ratingValue: -1, nrsValue: 7 }] },
        { weekNumber: 6, ratings: [{ approvedGoalId: 'n1', ratingValue: 1, nrsValue: 3 }] }, // best (lowest)
        { weekNumber: 10, ratings: [{ approvedGoalId: 'n1', ratingValue: 0, nrsValue: 5 }] },
        { weekNumber: 12, ratings: [{ approvedGoalId: 'n1', ratingValue: 0, nrsValue: 5 }] } // end
      ]
    });
    expect(out).toContain('nrsBaselineTarget(baseline=8,target=3');
    expect(out).toContain('nrsScaleWorst'); // lowerIsBetter => "10 = worst" framing
    expect(out).toContain('nrsBestEnd(best=3'); // lowest NRS, not the latest
    expect(out).toContain('bestWeek=6');
    expect(out).toContain('end=5');
    expect(out).toContain('endWeek=12');
  });

  it('reports sustained benefit when there is no qualifying post-peak drop', () => {
    const out = build({
      goals: [{ id: 'g2', patientFacingText: 'Stand longer', kind: 'gas', anchors: null }],
      checkins: [
        { weekNumber: 2, ratings: [{ approvedGoalId: 'g2', ratingValue: 0, nrsValue: null }] },
        { weekNumber: 6, ratings: [{ approvedGoalId: 'g2', ratingValue: 2, nrsValue: null }] },
        { weekNumber: 12, ratings: [{ approvedGoalId: 'g2', ratingValue: 2, nrsValue: null }] }
      ]
    });
    expect(out).toContain('benefitSustained');
    expect(out).not.toContain('wearingOffFrom(');
  });

  it('emits a no-ratings line for a goal that was never rated', () => {
    const out = build({
      goals: [{ id: 'g3', patientFacingText: 'Sleep through the night', kind: 'gas', anchors: null }],
      checkins: [] // no ratings at all
    });
    expect(out).toContain('noRatings');
  });
});

describe('buildEhrExport — formatting', () => {
  it('does not leave trailing blank lines', () => {
    const out = build({
      goals: [{ id: 'g1', patientFacingText: 'X', kind: 'gas', anchors: null }],
      checkins: []
    });
    expect(out.endsWith('\n')).toBe(false);
    expect(out.split('\n').at(-1)).not.toBe('');
  });
});
