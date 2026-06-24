/**
 * App wordmark — the product name as a small text logotype.
 *
 * Used on entry / orientation surfaces (login, signup, clinician home) to
 * give the app a bit of brand presence and trust. It is deliberately NOT
 * placed on task pages (treatment, patient, history): those headers are
 * contextual workspace bars where a persistent brand would only compete
 * with the page label and the clinical content.
 *
 * The product name is a brand string and is intentionally not localised.
 */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`font-display text-[16px] font-semibold tracking-tight text-ink ${className}`.trim()}
    >
      Treatment Companion
    </span>
  );
}
