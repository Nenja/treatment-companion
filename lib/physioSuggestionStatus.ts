/**
 * Friendly label for a physiotherapist-suggestion review status.
 *
 * The stored values are physio_review_status enum strings
 * ('needsReview' | 'accepted' | 'reviewed' | 'dismissed'). They must
 * never reach the user raw. Both 'accepted' (goal suggestions) and
 * 'reviewed' (muscle suggestions) mean the same thing to the reader —
 * the physician has taken the suggestion on board — so both render as
 * "Considered". A physiotherapist suggestion is inspiration for the
 * physician, not a draft goal; the vocabulary reflects that.
 */
export function physioSuggestionStatusLabel(status: string): string {
  switch (status) {
    case 'needsReview':
      return 'Awaiting review';
    case 'accepted':
    case 'reviewed':
      return 'Considered';
    case 'dismissed':
      return 'Dismissed';
    default:
      return 'Awaiting review';
  }
}
