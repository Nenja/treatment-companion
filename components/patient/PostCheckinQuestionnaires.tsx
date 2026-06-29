'use client';

import { useState, type ReactNode } from 'react';
import type { DueQuestionnaire } from '@/lib/supabase/questionnaires';
import { QuestionnaireForm } from './QuestionnaireForm';

/**
 * Steps through the questionnaires that are due for this check-in, then shows
 * the thank-you. The due list is resolved up front by the check-in wizard (by
 * patient + week) and passed in, so there's no post-submit fetch gap that would
 * flash the thank-you screen before the questions appear.
 *
 * `stepOffset` / `displayTotal` make the per-questionnaire counter continue the
 * check-in's own count (e.g. "Step 6 of 7"), so the whole thing reads as one
 * uninterrupted flow with a single finish.
 */
export function PostCheckinQuestionnaires({
  weeklyCheckinId,
  dueList,
  stepOffset = 0,
  displayTotal,
  thanks
}: {
  weeklyCheckinId: string;
  dueList: DueQuestionnaire[];
  stepOffset?: number;
  displayTotal?: number;
  thanks: ReactNode;
}) {
  const [index, setIndex] = useState(0);

  if (dueList.length === 0 || index >= dueList.length) return <>{thanks}</>;

  const current = dueList[index];
  const total = displayTotal ?? dueList.length;
  return (
    <QuestionnaireForm
      key={current.questionnaire_id}
      questionnaireId={current.questionnaire_id}
      title={current.title}
      weeklyCheckinId={weeklyCheckinId}
      assignmentId={current.assignment_id}
      step={{ current: stepOffset + index + 1, total }}
      onDone={() => setIndex((i) => i + 1)}
      onExit={() => setIndex(dueList.length)}
    />
  );
}
