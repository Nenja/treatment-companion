/**
 * Tour registry. Maps a page's help key to its ordered spotlight steps.
 *
 * Each step pairs a `target` selector (a `data-tour="…"` attribute on the
 * page) with a `key` used to look up its caption text in the `tour`
 * translation namespace: `tour.{pageKey}.{key}Title` / `…Body`.
 *
 * To give a page a guided tour:
 *   1. add `data-tour="…"` to the elements to highlight,
 *   2. add an entry here keyed by the page's helpPageKey,
 *   3. add the matching `tour.{pageKey}.{key}Title/Body` strings.
 * PageHelpButton does the rest — the "?" launches the tour and a one-time
 * "take a tour" nudge appears. No per-page wiring through layout props.
 */
export interface RegisteredTourStep {
  /** CSS selector for the element to highlight. */
  target: string;
  /** Caption key under tour.{pageKey}.{key}Title / …Body. */
  key: string;
}

export const TOURS: Record<string, RegisteredTourStep[]> = {
  clinicianPatient: [
    { target: '[data-tour="patient"]', key: 'patient' },
    { target: '[data-tour="actions"]', key: 'actions' },
    { target: '[data-tour="overview"]', key: 'overview' },
    { target: '[data-tour="goals"]', key: 'goals' },
    { target: '[data-tour="endsession"]', key: 'end' }
  ],
  patientHome: [
    { target: '[data-tour="greeting"]', key: 'welcome' },
    { target: '[data-tour="checkin"]', key: 'checkin' },
    { target: '[data-tour="goals"]', key: 'goals' },
    { target: '[data-tour="visitcode"]', key: 'visitcode' }
  ],
  goals: [
    { target: '[data-tour="goalslist"]', key: 'goals' },
    { target: '[data-tour="suggest"]', key: 'suggest' }
  ],
  physioPatient: [
    { target: '[data-tour="patient"]', key: 'patient' },
    { target: '[data-tour="rate"]', key: 'rate' },
    { target: '[data-tour="suggest"]', key: 'suggest' },
    { target: '[data-tour="endsession"]', key: 'end' }
  ],
  treatment: [
    { target: '[data-tour="intro"]', key: 'intro' },
    { target: '#tsec-setup', key: 'setup' },
    { target: '#tsec-muscles', key: 'muscles' }
  ],
  history: [
    { target: '[data-tour="summary"]', key: 'summary' },
    { target: '[data-tour="cycles"]', key: 'cycles' }
  ],
  suggestion: [
    { target: '[data-tour="detail"]', key: 'detail' },
    { target: '[data-tour="decide"]', key: 'decide' }
  ]
};

export function tourFor(pageKey: string): RegisteredTourStep[] {
  return TOURS[pageKey] ?? [];
}
