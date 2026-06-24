/**
 * Small visual primitives for loading skeletons.
 *
 * Used while data is being fetched on first render. The shapes here
 * mirror the actual content shapes (heading, paragraph, card, etc.)
 * so the page doesn't jump when the real content arrives.
 *
 * All blocks use the existing `stone` token (#E5DFD3) so they blend
 * with the cream background. Tailwind's animate-pulse applies a
 * gentle opacity cycle so the skeletons feel alive without being
 * distracting.
 */

interface SkeletonProps {
  /** Tailwind width class. Defaults to full width. */
  width?: string;
  /** Tailwind height class. Defaults to 1rem (h-4). */
  height?: string;
  /** Tailwind shape class. Defaults to rounded-md. */
  shape?: string;
  className?: string;
}

/**
 * Generic skeleton block. Compose into larger skeletons.
 */
export function SkeletonBlock({
  width = 'w-full',
  height = 'h-4',
  shape = 'rounded-md',
  className = ''
}: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-stone/70 ${width} ${height} ${shape} ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * A pretend heading line — 70% width on a short bar.
 */
export function SkeletonHeading({ className = '' }: { className?: string }) {
  return <SkeletonBlock width="w-3/5" height="h-7" className={className} />;
}

/**
 * 2-3 paragraph lines, the last shorter than the rest.
 */
export function SkeletonParagraph({
  lines = 2,
  className = ''
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock
          key={i}
          width={i === lines - 1 ? 'w-2/3' : 'w-full'}
          height="h-3.5"
        />
      ))}
    </div>
  );
}

/**
 * A pretend card with a heading line + a paragraph + a button row.
 */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5 ${className}`}
      role="presentation"
    >
      <SkeletonBlock width="w-1/2" height="h-5" />
      <div className="mt-3">
        <SkeletonParagraph lines={2} />
      </div>
      <SkeletonBlock width="w-2/5" height="h-10" shape="rounded-[var(--radius-button)]" className="mt-5" />
    </div>
  );
}

/**
 * The container that wraps every skeleton on a page. Gives the
 * loading state a screen-reader announcement so it's not invisible
 * to assistive tech.
 */
export function SkeletonScreen({
  children,
  label = 'Loading'
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}
