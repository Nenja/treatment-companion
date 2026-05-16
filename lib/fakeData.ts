import type {
  Patient,
  Clinician,
  TreatmentCycle,
  GoalSuggestion,
  ApprovedGoal,
  WeeklyPrompt,
  WeeklyCheckin,
  WeeklyGoalRating,
  AuditEvent,
  TreatmentSession
} from './types';
import { todayIso, addDaysIso } from './dates';

// Three patients, deliberately different shapes so every screen has something
// real to render:
//
//   Anna   — mid-cycle. 2 active goals. 4 completed check-ins. Week 5 pending.
//   Lars   — fresh. 2 suggestions awaiting review. No approved goals yet.
//   Mette  — further along. 3 active goals. 6 completed check-ins, one with a
//            reported side effect. Week 7 pending.

export interface Seed {
  now: string;
  patients: Patient[];
  clinicians: Clinician[];
  treatmentCycles: TreatmentCycle[];
  goalSuggestions: GoalSuggestion[];
  approvedGoals: ApprovedGoal[];
  weeklyPrompts: WeeklyPrompt[];
  weeklyCheckins: WeeklyCheckin[];
  treatmentSessions: TreatmentSession[];
  auditLog: AuditEvent[];
}

export function buildSeed(): Seed {
  const now = todayIso();

  // ---- Clinician ------------------------------------------------------
  const clinician: Clinician = {
    id: 'clin-1',
    displayName: 'Dr. Holm'
  };

  // ---- Patient: Anna --------------------------------------------------
  const annaCycleStart = addDaysIso(now, -7 * 4); // 4 full weeks ago, week 5 now
  const annaCycle: TreatmentCycle = {
    id: 'cyc-anna-2',
    patientId: 'pat-anna',
    cycleNumber: 2,
    lengthWeeks: 12,
    startDate: annaCycleStart,
    reviewDate: addDaysIso(annaCycleStart, 7 * 12),
    status: 'active'
  };
  const anna: Patient = {
    id: 'pat-anna',
    displayName: 'Anna',
    birthYear: 1962,
    activeTreatmentCycleId: annaCycle.id
  };

  const annaSuggestion1: GoalSuggestion = {
    id: 'sug-anna-1',
    patientId: anna.id,
    treatmentCycleId: annaCycle.id,
    domain: 'hygiene',
    patientWording: 'I want to be able to wash inside my left hand more easily.',
    importance: 'high',
    hopedTimeframe: '8w',
    createdAt: addDaysIso(annaCycleStart, -3),
    status: 'active'
  };
  const annaSuggestion2: GoalSuggestion = {
    id: 'sug-anna-2',
    patientId: anna.id,
    treatmentCycleId: annaCycle.id,
    domain: 'sleep',
    patientWording: 'Fewer spasms at night so I can sleep better.',
    importance: 'medium',
    hopedTimeframe: '8w',
    createdAt: addDaysIso(annaCycleStart, -3),
    status: 'active'
  };

  const annaGoal1: ApprovedGoal = {
    id: 'goal-anna-1',
    suggestionId: annaSuggestion1.id,
    patientId: anna.id,
    treatmentCycleId: annaCycle.id,
    patientFacingText: 'Make it easier to open my hand for washing.',
    smartText:
      'Within 8 weeks, improve passive opening of the left hand to allow daily palm hygiene with mild difficulty.',
    gasAnchors: {
      minus2: 'Hand remains closed most of the time and hygiene is very difficult.',
      minus1: 'Hand opens slightly but hygiene is still difficult.',
      zero: 'Hand can be opened enough for daily hygiene with mild difficulty.',
      plus1: 'Hand hygiene is easy on most days.',
      plus2: 'Hand hygiene is easy every day without discomfort.'
    },
    approvedByClinicianId: clinician.id,
    approvedAt: addDaysIso(annaCycleStart, 0),
    status: 'active'
  };
  const annaGoal2: ApprovedGoal = {
    id: 'goal-anna-2',
    suggestionId: annaSuggestion2.id,
    patientId: anna.id,
    treatmentCycleId: annaCycle.id,
    patientFacingText: 'Have fewer night-time leg spasms.',
    smartText:
      'Within 8 weeks, reduce reported night-time spasm frequency to a level that allows uninterrupted sleep on most nights.',
    gasAnchors: {
      minus2: 'Several spasms every night, sleep frequently interrupted.',
      minus1: 'Spasms most nights, sleep often interrupted.',
      zero: 'Occasional night-time spasms, uninterrupted sleep on most nights.',
      plus1: 'Rare night-time spasms, sleep generally uninterrupted.',
      plus2: 'No night-time spasms reported, consistent sleep.'
    },
    approvedByClinicianId: clinician.id,
    approvedAt: addDaysIso(annaCycleStart, 0),
    status: 'active'
  };

  const annaPrompts: WeeklyPrompt[] = [1, 2, 3, 4, 5].map((wk) => ({
    id: `wp-anna-${wk}`,
    patientId: anna.id,
    treatmentCycleId: annaCycle.id,
    weekNumber: wk,
    dueDate: addDaysIso(annaCycleStart, (wk - 1) * 7),
    status: wk < 5 ? 'completed' : 'pending'
  }));

  // Anna's first four check-ins. Ratings are deliberately mixed —
  // descriptive data only, no implied trend interpretation.
  const annaCheckins: WeeklyCheckin[] = [
    {
      weekNumber: 1,
      pain: 6,
      stiffness: 7,
      spasm: 'daily' as const,
      care: 'unchanged' as const,
      g1: 'asExpected' as const,
      g2: 'aLittleWorseThanExpected' as const
    },
    {
      weekNumber: 2,
      pain: 5,
      stiffness: 6,
      spasm: 'occasional' as const,
      care: 'easier' as const,
      g1: 'betterThanExpected' as const,
      g2: 'asExpected' as const
    },
    {
      weekNumber: 3,
      pain: 5,
      stiffness: 5,
      spasm: 'occasional' as const,
      care: 'easier' as const,
      g1: 'asExpected' as const,
      g2: 'asExpected' as const
    },
    {
      weekNumber: 4,
      pain: 4,
      stiffness: 5,
      spasm: 'occasional' as const,
      care: 'easier' as const,
      g1: 'betterThanExpected' as const,
      g2: 'asExpected' as const
    }
  ].map((c) => {
    const checkinId = `ci-anna-${c.weekNumber}`;
    const ratings: WeeklyGoalRating[] = [
      {
        id: `${checkinId}-r1`,
        weeklyCheckinId: checkinId,
        approvedGoalId: annaGoal1.id,
        ratingLabel: c.g1,
        ratingValue:
          c.g1 === 'betterThanExpected' ? 1 : c.g1 === 'asExpected' ? 0 : -1
      },
      {
        id: `${checkinId}-r2`,
        weeklyCheckinId: checkinId,
        approvedGoalId: annaGoal2.id,
        ratingLabel: c.g2,
        ratingValue: c.g2 === 'aLittleWorseThanExpected' ? -1 : 0
      }
    ];
    return {
      id: checkinId,
      weeklyPromptId: `wp-anna-${c.weekNumber}`,
      patientId: anna.id,
      treatmentCycleId: annaCycle.id,
      weekNumber: c.weekNumber,
      submittedAt: addDaysIso(annaCycleStart, (c.weekNumber - 1) * 7 + 1),
      pain: c.pain,
      stiffness: c.stiffness,
      spasmFrequency: c.spasm,
      dailyCare: c.care,
      sideEffects: [],
      ratings
    };
  });

  // ---- Patient: Lars --------------------------------------------------
  const larsCycleStart = addDaysIso(now, -7 * 1);
  const larsCycle: TreatmentCycle = {
    id: 'cyc-lars-1',
    patientId: 'pat-lars',
    cycleNumber: 1,
    lengthWeeks: 14,
    startDate: larsCycleStart,
    reviewDate: addDaysIso(larsCycleStart, 7 * 14),
    status: 'active'
  };
  const lars: Patient = {
    id: 'pat-lars',
    displayName: 'Lars',
    birthYear: 1974,
    activeTreatmentCycleId: larsCycle.id
  };

  const larsSuggestions: GoalSuggestion[] = [
    {
      id: 'sug-lars-1',
      patientId: lars.id,
      treatmentCycleId: larsCycle.id,
      domain: 'walking',
      patientWording:
        'I want to walk to the shop and back without my knee giving way.',
      importance: 'high',
      hopedTimeframe: '12w',
      createdAt: addDaysIso(now, -2),
      status: 'needsReview'
    },
    {
      id: 'sug-lars-2',
      patientId: lars.id,
      treatmentCycleId: larsCycle.id,
      domain: 'pain',
      patientWording:
        'The pain in my arm at night is keeping me awake. I would like that to be less.',
      importance: 'medium',
      hopedTimeframe: 'notSure',
      createdAt: addDaysIso(now, -2),
      difficultyContext: 'Worse when I lie on my left side.',
      status: 'needsReview'
    }
  ];

  const larsPrompts: WeeklyPrompt[] = [1, 2].map((wk) => ({
    id: `wp-lars-${wk}`,
    patientId: lars.id,
    treatmentCycleId: larsCycle.id,
    weekNumber: wk,
    dueDate: addDaysIso(larsCycleStart, (wk - 1) * 7),
    status: 'pending'
  }));

  // ---- Patient: Mette -------------------------------------------------
  const metteCycleStart = addDaysIso(now, -7 * 6);
  const metteCycle: TreatmentCycle = {
    id: 'cyc-mette-3',
    patientId: 'pat-mette',
    cycleNumber: 3,
    lengthWeeks: 16,
    startDate: metteCycleStart,
    reviewDate: addDaysIso(metteCycleStart, 7 * 16),
    status: 'active'
  };
  const mette: Patient = {
    id: 'pat-mette',
    displayName: 'Mette',
    birthYear: 1958,
    activeTreatmentCycleId: metteCycle.id
  };

  const metteSuggestions: GoalSuggestion[] = [
    {
      id: 'sug-mette-1',
      patientId: mette.id,
      treatmentCycleId: metteCycle.id,
      domain: 'positioning',
      patientWording: 'Sit more comfortably in my wheelchair for longer.',
      importance: 'high',
      hopedTimeframe: '8w',
      createdAt: addDaysIso(metteCycleStart, -4),
      status: 'active'
    },
    {
      id: 'sug-mette-2',
      patientId: mette.id,
      treatmentCycleId: metteCycle.id,
      domain: 'transfers',
      patientWording: 'Get from my chair to the toilet without help.',
      importance: 'high',
      hopedTimeframe: '12w',
      createdAt: addDaysIso(metteCycleStart, -4),
      status: 'active'
    },
    {
      id: 'sug-mette-3',
      patientId: mette.id,
      treatmentCycleId: metteCycle.id,
      domain: 'caregiverHelp',
      patientWording: 'Need less help with dressing in the morning.',
      importance: 'medium',
      hopedTimeframe: '12w',
      createdAt: addDaysIso(metteCycleStart, -4),
      status: 'active'
    }
  ];

  const metteGoals: ApprovedGoal[] = [
    {
      id: 'goal-mette-1',
      suggestionId: 'sug-mette-1',
      patientId: mette.id,
      treatmentCycleId: metteCycle.id,
      patientFacingText: 'Sit comfortably in my chair for longer periods.',
      smartText:
        'Within 8 weeks, improve seated posture so that comfortable sitting time reaches 2 hours without repositioning.',
      gasAnchors: {
        minus2: 'Comfortable sitting limited to under 30 minutes.',
        minus1: 'Comfortable sitting around 1 hour before repositioning.',
        zero: 'Comfortable sitting around 2 hours before repositioning.',
        plus1: 'Comfortable sitting around 3 hours before repositioning.',
        plus2: 'Comfortable sitting for a full afternoon without repositioning.'
      },
      approvedByClinicianId: clinician.id,
      approvedAt: addDaysIso(metteCycleStart, 0),
      status: 'active'
    },
    {
      id: 'goal-mette-2',
      suggestionId: 'sug-mette-2',
      patientId: mette.id,
      treatmentCycleId: metteCycle.id,
      patientFacingText: 'Move from chair to toilet with less help.',
      smartText:
        'Within 12 weeks, complete a chair-to-toilet transfer with stand-by supervision rather than physical assistance.',
      gasAnchors: {
        minus2: 'Transfer requires full physical assistance from two people.',
        minus1: 'Transfer requires physical assistance from one person.',
        zero: 'Transfer completed with stand-by supervision only.',
        plus1: 'Transfer completed independently most days.',
        plus2: 'Transfer completed independently every day.'
      },
      approvedByClinicianId: clinician.id,
      approvedAt: addDaysIso(metteCycleStart, 0),
      status: 'active'
    },
    {
      id: 'goal-mette-3',
      suggestionId: 'sug-mette-3',
      patientId: mette.id,
      treatmentCycleId: metteCycle.id,
      patientFacingText: 'Need less help getting dressed in the morning.',
      smartText:
        'Within 12 weeks, complete upper-body dressing with set-up help only.',
      gasAnchors: {
        minus2: 'Full physical assistance needed for all dressing.',
        minus1: 'Physical assistance needed for upper-body dressing.',
        zero: 'Upper-body dressing completed with set-up help only.',
        plus1: 'Upper-body dressing completed independently most days.',
        plus2: 'All dressing completed independently.'
      },
      approvedByClinicianId: clinician.id,
      approvedAt: addDaysIso(metteCycleStart, 0),
      status: 'active'
    }
  ];

  const mettePrompts: WeeklyPrompt[] = [1, 2, 3, 4, 5, 6, 7].map((wk) => ({
    id: `wp-mette-${wk}`,
    patientId: mette.id,
    treatmentCycleId: metteCycle.id,
    weekNumber: wk,
    dueDate: addDaysIso(metteCycleStart, (wk - 1) * 7),
    status: wk < 7 ? 'completed' : 'pending'
  }));

  // Mette's six check-ins. Week 3 had a reported fall — recorded as a
  // patient comment, not a categorical "side effect" question (which we
  // removed). The clinician surfaces this descriptively in the summary,
  // never as "treatment failure".
  const metteCheckinSpec = [
    { wk: 1, pain: 5, stiff: 6, spasm: 'daily', care: 'unchanged', se: [], comment: undefined as string | undefined },
    { wk: 2, pain: 5, stiff: 6, spasm: 'occasional', care: 'unchanged', se: [], comment: undefined },
    { wk: 3, pain: 6, stiff: 6, spasm: 'occasional', care: 'harder', se: ['falls'], comment: 'I had a fall on Tuesday when getting up from the wheelchair. No injuries. I called the clinic and the nurse said to mention it at my next visit.' },
    { wk: 4, pain: 5, stiff: 5, spasm: 'occasional', care: 'unchanged', se: [], comment: undefined },
    { wk: 5, pain: 4, stiff: 5, spasm: 'occasional', care: 'easier', se: [], comment: 'Transfers feel easier this week.' },
    { wk: 6, pain: 4, stiff: 4, spasm: 'occasional', care: 'easier', se: [], comment: undefined }
  ] as const;

  const metteCheckins: WeeklyCheckin[] = metteCheckinSpec.map((c) => {
    const checkinId = `ci-mette-${c.wk}`;
    const ratings: WeeklyGoalRating[] = metteGoals.map((g, idx) => ({
      id: `${checkinId}-r${idx + 1}`,
      weeklyCheckinId: checkinId,
      approvedGoalId: g.id,
      ratingLabel: 'asExpected' as const,
      ratingValue: 0
    }));
    return {
      id: checkinId,
      weeklyPromptId: `wp-mette-${c.wk}`,
      patientId: mette.id,
      treatmentCycleId: metteCycle.id,
      weekNumber: c.wk,
      submittedAt: addDaysIso(metteCycleStart, (c.wk - 1) * 7 + 1),
      pain: c.pain,
      stiffness: c.stiff,
      spasmFrequency: c.spasm,
      dailyCare: c.care,
      sideEffects: [...c.se],
      comment: c.comment,
      ratings
    };
  });

  // ---- Treatment sessions (recorded by clinician at cycle start) -----
  // Anna and Mette already have an active cycle, so they have a record.
  // Lars is in week 1-2; we'll seed a minimal record so the clinician
  // view shows something.
  const annaTreatment: TreatmentSession = {
    id: 'tx-anna-2',
    patientId: anna.id,
    treatmentCycleId: annaCycle.id,
    date: annaCycleStart,
    drugProduct: 'Botox',
    totalUnits: 400,
    injections: [
      {
        id: 'tx-anna-2-i1',
        muscle: 'Flexor digitorum superficialis',
        side: 'left',
        doseUnits: 50,
        guidance: 'ultrasound'
      },
      {
        id: 'tx-anna-2-i2',
        muscle: 'Flexor digitorum profundus',
        side: 'left',
        doseUnits: 50,
        guidance: 'ultrasound'
      },
      {
        id: 'tx-anna-2-i3',
        muscle: 'Gastrocnemius',
        side: 'left',
        doseUnits: 150,
        guidance: 'anatomicalLandmarks'
      },
      {
        id: 'tx-anna-2-i4',
        muscle: 'Soleus',
        side: 'left',
        doseUnits: 150,
        guidance: 'anatomicalLandmarks'
      }
    ],
    notes: 'Patient tolerated procedure well. Repeat at cycle review.',
    recordedByClinicianId: clinician.id,
    recordedAt: new Date(annaCycleStart + 'T10:30:00Z').toISOString()
  };

  return {
    now,
    patients: [anna, lars, mette],
    clinicians: [clinician],
    treatmentCycles: [annaCycle, larsCycle, metteCycle],
    goalSuggestions: [
      annaSuggestion1,
      annaSuggestion2,
      ...larsSuggestions,
      ...metteSuggestions
    ],
    approvedGoals: [annaGoal1, annaGoal2, ...metteGoals],
    weeklyPrompts: [...annaPrompts, ...larsPrompts, ...mettePrompts],
    weeklyCheckins: [...annaCheckins, ...metteCheckins],
    treatmentSessions: [annaTreatment],
    auditLog: []
  };
}
