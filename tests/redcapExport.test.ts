import { describe, it, expect } from 'vitest';
import { esc, toCsv, patientRows } from '@/lib/redcapExport';

describe('esc (RFC-4180 field escaping)', () => {
  it('passes plain values through unquoted', () => {
    expect(esc('plain')).toBe('plain');
    expect(esc('')).toBe('');
  });
  it('quotes a value containing a comma', () => {
    expect(esc('a,b')).toBe('"a,b"');
  });
  it('doubles embedded quotes and wraps the whole field', () => {
    expect(esc('she said "hi"')).toBe('"she said ""hi"""');
  });
  it('quotes values containing newlines or carriage returns', () => {
    expect(esc('line1\nline2')).toBe('"line1\nline2"');
    expect(esc('a\rb')).toBe('"a\rb"');
  });
});

// One research-consented patient with a single cycle, goal, check-in and
// goal-rating — enough to exercise every coder path that matters.
const samplePatient = {
  record_id: 'TC-0001',
  research_consent: true,
  research_consent_recorded_at: '2026-01-05T10:00:00Z',
  birth_year: 1980,
  sex: 'female',
  etiology: 'stroke',
  affected_side: 'right',
  ambulation: 'withAid',
  created_at: '2026-01-01T00:00:00Z',
  cycles: [
    { cycle_number: 1, start_date: '2026-01-10', status: 'active', modality: 'botulinum_toxin' }
  ],
  goals: [
    {
      goal_index: 1,
      cycle_number: 1,
      goal_kind: 'gas',
      patient_facing_text: 'Walk',
      status: 'active'
    }
  ],
  checkins: [
    {
      week_number: 1,
      cycle_number: 1,
      submitted_at: '2026-01-17T00:00:00Z',
      submitter_label: 'self',
      side_effects: ['weakness', 'falls'],
      training_days: 3
    }
  ],
  goal_ratings: [
    {
      goal_index: 1,
      week_number: 1,
      cycle_number: 1,
      nrs_value: 5,
      rating_value: 1,
      clinic_video_rating: -2,
      clinic_video_nrs: 6
    }
  ]
};

describe('patientRows (REDCap coding)', () => {
  const rows = patientRows(samplePatient);
  const byInstrument = (name: string) =>
    rows.filter((r) => r.redcap_repeat_instrument === name);

  it('emits one non-repeating enrolment row with coded demographics', () => {
    const enrol = rows.find((r) => r.redcap_repeat_instrument === '');
    expect(enrol).toBeDefined();
    expect(enrol!.record_id).toBe('TC-0001');
    expect(enrol!.research_consent).toBe('1'); // yes -> 1
    expect(enrol!.sex).toBe('1'); // female -> 1
    expect(enrol!.diagnosis).toBe('1'); // stroke -> 1
    expect(enrol!.affected_side).toBe('2'); // right -> 2
    expect(enrol!.ambulation).toBe('2'); // withAid -> 2
    expect(enrol!.birth_year).toBe('1980');
  });

  it('codes the cycle and numbers the repeat instance from 1', () => {
    const c = byInstrument('treatment_cycle');
    expect(c).toHaveLength(1);
    expect(c[0].redcap_repeat_instance).toBe('1');
    expect(c[0].cycle_modality).toBe('1'); // botulinum_toxin -> 1
    expect(c[0].cycle_status).toBe('1'); // active -> 1
  });

  it('expands the side-effects checkbox and codes the submitter', () => {
    const ci = byInstrument('checkin');
    expect(ci).toHaveLength(1);
    expect(ci[0].ci_submitter).toBe('1'); // self -> 1
    expect(ci[0].ci_side_effects___1).toBe('1'); // weakness present
    expect(ci[0].ci_side_effects___2).toBe('1'); // falls present
    expect(ci[0].ci_side_effects___3).toBe('0'); // swallowing absent
    expect(ci[0].ci_training_days_home).toBe('3');
  });

  it('shifts GAS values by +3 into dictionary codes 1..5', () => {
    const gr = byInstrument('goal_rating');
    expect(gr).toHaveLength(1);
    expect(gr[0].gr_gas_value).toBe('4'); // +1 -> 4
    expect(gr[0].gr_clinic_video_gas).toBe('1'); // -2 -> 1
    expect(gr[0].gr_clinic_video_nrs).toBe('6'); // NRS passes through
    expect(gr[0].gr_nrs_value).toBe('5');
  });

  it('codes the goal kind and propagates record_id to every row', () => {
    expect(byInstrument('goal')[0].goal_kind).toBe('2'); // gas -> 2
    expect(rows.every((r) => r.record_id === 'TC-0001')).toBe(true);
  });
});

describe('toCsv', () => {
  const rows = patientRows(samplePatient);
  const csv = toCsv(rows);

  it('uses CRLF line endings', () => {
    expect(csv.includes('\r\n')).toBe(true);
  });

  it('emits a header plus one line per row', () => {
    const lines = csv.split('\r\n');
    expect(lines.length).toBe(rows.length + 1);
    expect(
      lines[0].startsWith('record_id,redcap_repeat_instrument,redcap_repeat_instance,')
    ).toBe(true);
  });

  it('keeps a consistent column count on every line (RFC-4180)', () => {
    const lines = csv.split('\r\n');
    const commaCounts = lines.map((l) => (l.match(/,/g) ?? []).length);
    expect(new Set(commaCounts).size).toBe(1);
  });
});
