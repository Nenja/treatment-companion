import type { useTranslations } from 'next-intl';
import type { QuestionnaireResponseItem } from '@/lib/supabase/questionnaires';

/**
 * Human-readable answer for one questionnaire item, mapping option values back
 * to their labels (single/likert), joining multi-select labels, and rendering
 * boolean as Yes/No. `tQ` must be bound to the `clinician.questionnaires`
 * namespace (for answerYes / answerNo). Raw values only — no scoring.
 */
export function formatAnswer(
  item: QuestionnaireResponseItem,
  tQ: ReturnType<typeof useTranslations>
): string {
  const labelFor = (val: string) =>
    item.options?.find((o) => o.value === val)?.label ?? val;
  switch (item.item_type) {
    case 'boolean':
      if (item.value_num != null) return item.value_num === 1 ? tQ('answerYes') : tQ('answerNo');
      if (item.value_text === 'true') return tQ('answerYes');
      if (item.value_text === 'false') return tQ('answerNo');
      return item.value_text ?? '—';
    case 'nrs_0_10':
    case 'number':
      return item.value_num != null ? String(item.value_num) : (item.value_text ?? '—');
    case 'single_choice':
    case 'likert':
      return item.value_text ? labelFor(item.value_text) : '—';
    case 'multi_choice':
      if (!item.value_text) return '—';
      try {
        const arr = JSON.parse(item.value_text) as string[];
        return arr.length ? arr.map(labelFor).join(', ') : '—';
      } catch {
        return item.value_text;
      }
    case 'text':
    default:
      return item.value_text && item.value_text.trim() ? item.value_text : '—';
  }
}
