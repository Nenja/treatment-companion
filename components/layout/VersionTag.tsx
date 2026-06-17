import { APP_VERSION, BUILD_DATE } from '@/lib/version';

/**
 * Compact build identifier for footers. Locale-neutral on purpose (a version
 * string is the same in every language), so it needs no translation. Lets
 * testers report the exact build they hit an issue on.
 */
export function VersionTag({ className }: { className?: string }) {
  return (
    <span className={className}>
      v{APP_VERSION} · {BUILD_DATE}
    </span>
  );
}
