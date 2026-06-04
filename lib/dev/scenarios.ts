// DEV-ONLY scenario catalog for the test-run launcher. Maps each demo
// patient (seeded by demo_seed_test_patients.sql / dev_reseed_all) to the
// role you want to land as. Plain data, shared by the launcher page and the
// /api/dev/scenario route. English-only on purpose — it never ships to users.

export type ScenarioRole = 'patient' | 'clinician' | 'physio';

export interface DevScenario {
  id: string;
  title: string;
  description: string;
  /** Whose screen to drop you onto. */
  landAs: ScenarioRole;
  /** The demo patient this scenario is about. */
  patientEmail: string;
}

export const DEV_SCENARIOS: DevScenario[] = [
  {
    id: 'clinician-going-well',
    title: 'Going well — clinician view',
    description:
      'test1, ~week 6. Two goals trending positive. Lands on the patient page.',
    landAs: 'clinician',
    patientEmail: 'test1@example.com'
  },
  {
    id: 'clinician-struggling',
    title: 'Struggling — clinician view',
    description: 'test2, mid-cycle with a negative trend.',
    landAs: 'clinician',
    patientEmail: 'test2@example.com'
  },
  {
    id: 'clinician-suggestions',
    title: 'Pending suggestions — clinician view',
    description:
      'test3. Patient + therapist suggestions waiting to be reviewed.',
    landAs: 'clinician',
    patientEmail: 'test3@example.com'
  },
  {
    id: 'clinician-missed',
    title: 'Missed check-ins — clinician view',
    description: 'test4. Gaps in weekly reporting.',
    landAs: 'clinician',
    patientEmail: 'test4@example.com'
  },
  {
    id: 'clinician-retreatment',
    title: 'Re-treatment due — clinician view',
    description: 'test5, ~week 15. Effect worn off, due for re-treatment.',
    landAs: 'clinician',
    patientEmail: 'test5@example.com'
  },
  {
    id: 'clinician-longitudinal',
    title: 'Longitudinal history — clinician view',
    description: 'test6. Three completed cycles plus an active one.',
    landAs: 'clinician',
    patientEmail: 'test6@example.com'
  },
  {
    id: 'physio-suggestions',
    title: 'Pending suggestions — physio view',
    description: 'test3 from the physiotherapist side.',
    landAs: 'physio',
    patientEmail: 'test3@example.com'
  },
  {
    id: 'patient-going-well',
    title: 'Patient home — going well',
    description:
      'Signs in as test1 and lands on the patient home (a check-in if one is due).',
    landAs: 'patient',
    patientEmail: 'test1@example.com'
  },
  {
    id: 'patient-missed',
    title: 'Patient home — missed check-ins',
    description: 'Signs in as test4 (gaps in reporting).',
    landAs: 'patient',
    patientEmail: 'test4@example.com'
  }
];
