'use client';

import { useState, type ReactNode } from 'react';
import { useDueQuestionnaires } from '@/lib/supabase/questionnaires';
import { QuestionnaireForm } from './QuestionnaireForm';

/**
 * Owns the post-check-in experience. After a check-in is submitted we have its
 * id, so we resolve which questionnaires are due and step through them; once
 * none remain (or none were due), we render the normal thank-you screen.
 *
 * The check-in wizard itself is untouched — this only governs what shows after
 * a successful submit.
 */
export function PostCheckinQuestionnaires({
  weeklyCheckinId,
  thanks
}: {
  weeklyCheckinId: string;
  thanks: ReactNode;
}) {
  const due = useDueQuestionnaires(weeklyCheckinId);
  const [index, setIndex] = useState(0);

  // While we don't yet know what's due, hold on the thank-you screen rather
  // than flashing it and then swapping — show nothing structural, just thanks.
  if (due.isLoading || due.isError) return <>{thanks}</>;

  const list = due.data ?? [];
  if (list.length === 0 || index >= list.length) return <>{thanks}</>;

  const current = list[index];
  return (
    <QuestionnaireForm
      key={current.questionnaire_id}
      questionnaireId={current.questionnaire_id}
      title={current.title}
      weeklyCheckinId={weeklyCheckinId}
      assignmentId={current.assignment_id}
      step={{ current: index + 1, total: list.length }}
      onDone={() => setIndex((i) => i + 1)}
    />
  );
}
