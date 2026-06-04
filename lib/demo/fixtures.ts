import type { NrsDirection } from '@/lib/types';

// Made-up data for the no-auth demo sandbox (/demo). Nothing here touches
// Supabase — these fixtures feed the real presentational components directly,
// so the demo looks like the app without any login, session, or database.

export type GoalKind = 'nrs' | 'gas';

export interface DemoWeekRating {
  weekNumber: number;
  value: -2 | -1 | 0 | 1 | 2 | null;
  nrs: number | null;
  reported: boolean;
  comment?: string;
}

export interface DemoPhysioPoint {
  weekNumber: number;
  nrs: number;
  value: -2 | -1 | 0 | 1 | 2;
  note: string | null;
}

export interface DemoGoal {
  id: string;
  goalText: string;
  kind: GoalKind;
  // NRS goals:
  question?: string;
  direction?: NrsDirection;
  // GAS goals:
  anchors?: {
    minus2: string | null;
    minus1: string | null;
    zero: string | null;
    plus1: string | null;
    plus2: string | null;
  };
  ratings: DemoWeekRating[];
  physioRatings?: DemoPhysioPoint[];
}

export interface DemoScenario {
  id: string;
  title: string;
  blurb: string;
  patientName: string;
  cycleNumber: number;
  currentWeek: number;
  visitNote: string;
  goals: DemoGoal[];
  training: { week: number; home: number[]; therapist: number[] }[];
}

const WALK_ANCHORS = {
  minus2: 'Cannot walk to the mailbox at all',
  minus1: 'Walks part way, needs to stop and rest',
  zero: 'Walks to the mailbox with one rest',
  plus1: 'Walks to the mailbox without resting',
  plus2: 'Walks to the mailbox and back without resting'
};

const DRESS_ANCHORS = {
  minus2: 'Needs full help to put on a shirt',
  minus1: 'Needs some help with sleeves',
  zero: 'Dresses upper body slowly but alone',
  plus1: 'Dresses upper body at a normal pace',
  plus2: 'Dresses fully without any difficulty'
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'going-well',
    title: 'Going well',
    blurb: 'Positive trend across both goals, steady training.',
    patientName: 'Avery (demo)',
    cycleNumber: 1,
    currentWeek: 8,
    visitNote:
      'Tolerating treatment well. Hand function noticeably steadier and walking endurance improving. Continue current dosing plan and exercise routine.',
    goals: [
      {
        id: 'cup',
        goalText: 'Hold a cup of tea steadily',
        kind: 'nrs',
        question: 'How steady does holding a cup feel this week?',
        direction: 'higherIsBetter',
        ratings: [
          { weekNumber: 1, value: -1, nrs: 4, reported: true },
          { weekNumber: 2, value: 0, nrs: 5, reported: true },
          {
            weekNumber: 3,
            value: 0,
            nrs: 6,
            reported: true,
            comment: 'Spilling less at breakfast.'
          },
          { weekNumber: 4, value: 1, nrs: 6, reported: true },
          { weekNumber: 5, value: 1, nrs: 7, reported: true },
          { weekNumber: 6, value: 1, nrs: 8, reported: true },
          { weekNumber: 7, value: 2, nrs: 8, reported: true },
          { weekNumber: 8, value: 2, nrs: 9, reported: true }
        ],
        physioRatings: [
          { weekNumber: 3, nrs: 6, value: 0, note: null },
          {
            weekNumber: 6,
            nrs: 8,
            value: 1,
            note: 'Good carryover into daily tasks.'
          }
        ]
      },
      {
        id: 'walk',
        goalText: 'Walk to the mailbox without resting',
        kind: 'gas',
        anchors: WALK_ANCHORS,
        ratings: [
          { weekNumber: 1, value: -2, nrs: null, reported: true },
          { weekNumber: 2, value: -1, nrs: null, reported: true },
          { weekNumber: 3, value: -1, nrs: null, reported: true },
          { weekNumber: 4, value: 0, nrs: null, reported: true },
          { weekNumber: 5, value: 0, nrs: null, reported: true },
          { weekNumber: 6, value: 1, nrs: null, reported: true },
          { weekNumber: 7, value: 1, nrs: null, reported: true },
          { weekNumber: 8, value: 1, nrs: null, reported: true }
        ],
        physioRatings: [{ weekNumber: 6, nrs: 0, value: 1, note: null }]
      }
    ],
    training: [
      { week: 1, home: [1, 3, 5], therapist: [2] },
      { week: 2, home: [1, 2, 4, 6], therapist: [3] },
      { week: 3, home: [1, 3, 5, 6], therapist: [2] },
      { week: 4, home: [1, 2, 4, 5, 6], therapist: [] },
      { week: 5, home: [1, 3, 5], therapist: [4] },
      { week: 6, home: [1, 2, 3, 5, 6], therapist: [2] },
      { week: 7, home: [1, 3, 4, 6], therapist: [] },
      { week: 8, home: [1, 2, 4, 5], therapist: [3] }
    ]
  },
  {
    id: 'struggling',
    title: 'Struggling',
    blurb: 'Flat or declining goals, sparse training.',
    patientName: 'Sam (demo)',
    cycleNumber: 2,
    currentWeek: 6,
    visitNote:
      'Limited carryover so far. Pain with dressing not improving and walking plateaued. Review exercise plan and consider forearm dosing at the next visit.',
    goals: [
      {
        id: 'dress-pain',
        goalText: 'Less pain when getting dressed',
        kind: 'nrs',
        question: 'How much pain do you feel when getting dressed?',
        direction: 'lowerIsBetter',
        ratings: [
          { weekNumber: 1, value: -1, nrs: 7, reported: true },
          { weekNumber: 2, value: -1, nrs: 7, reported: true },
          {
            weekNumber: 3,
            value: -2,
            nrs: 8,
            reported: true,
            comment: 'Worse on cold mornings.'
          },
          { weekNumber: 4, value: -1, nrs: 6, reported: true },
          { weekNumber: 5, value: -1, nrs: 7, reported: true },
          { weekNumber: 6, value: -1, nrs: 7, reported: true }
        ]
      },
      {
        id: 'walk2',
        goalText: 'Walk to the mailbox without resting',
        kind: 'gas',
        anchors: WALK_ANCHORS,
        ratings: [
          { weekNumber: 1, value: -1, nrs: null, reported: true },
          { weekNumber: 2, value: -1, nrs: null, reported: true },
          { weekNumber: 3, value: 0, nrs: null, reported: true },
          { weekNumber: 4, value: -1, nrs: null, reported: true },
          { weekNumber: 5, value: 0, nrs: null, reported: true },
          { weekNumber: 6, value: -1, nrs: null, reported: true }
        ],
        physioRatings: [
          {
            weekNumber: 4,
            nrs: 0,
            value: -1,
            note: 'Tone returning earlier than hoped.'
          }
        ]
      }
    ],
    training: [
      { week: 1, home: [2], therapist: [] },
      { week: 2, home: [3, 5], therapist: [] },
      { week: 3, home: [], therapist: [] },
      { week: 4, home: [4], therapist: [] },
      { week: 5, home: [2, 6], therapist: [] },
      { week: 6, home: [3], therapist: [] }
    ]
  },
  {
    id: 'missed',
    title: 'Missed check-ins',
    blurb: 'Gaps in weekly reporting and training.',
    patientName: 'Jordan (demo)',
    cycleNumber: 1,
    currentWeek: 7,
    visitNote:
      'Several weeks not reported. Followed up by phone — patient is doing the exercises but forgetting to check in. Encouraged weekly reminders.',
    goals: [
      {
        id: 'dress2',
        goalText: 'Dress my upper body on my own',
        kind: 'gas',
        anchors: DRESS_ANCHORS,
        ratings: [
          { weekNumber: 1, value: -1, nrs: null, reported: true },
          { weekNumber: 2, value: null, nrs: null, reported: false },
          { weekNumber: 3, value: 0, nrs: null, reported: true },
          { weekNumber: 4, value: null, nrs: null, reported: false },
          { weekNumber: 5, value: null, nrs: null, reported: false },
          { weekNumber: 6, value: 0, nrs: null, reported: true },
          { weekNumber: 7, value: 1, nrs: null, reported: true }
        ]
      },
      {
        id: 'cup2',
        goalText: 'Hold a cup of tea steadily',
        kind: 'nrs',
        question: 'How steady does holding a cup feel this week?',
        direction: 'higherIsBetter',
        ratings: [
          { weekNumber: 1, value: 0, nrs: 5, reported: true },
          { weekNumber: 2, value: null, nrs: null, reported: false },
          { weekNumber: 3, value: 0, nrs: 6, reported: true },
          { weekNumber: 4, value: null, nrs: null, reported: false },
          { weekNumber: 5, value: null, nrs: null, reported: false },
          { weekNumber: 6, value: 1, nrs: 7, reported: true },
          { weekNumber: 7, value: 1, nrs: 7, reported: true }
        ]
      }
    ],
    training: [
      { week: 1, home: [1, 3, 5], therapist: [2] },
      { week: 3, home: [2, 4], therapist: [] },
      { week: 6, home: [1, 3, 5, 6], therapist: [4] },
      { week: 7, home: [1, 2, 4], therapist: [] }
    ]
  }
];
