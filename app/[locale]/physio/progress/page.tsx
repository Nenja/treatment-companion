'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';

/**
 * Retired route. Progress reporting now lives inline on /physio/patient as
 * the unified per-goal cards (cockpit-65), so this dedicated page is no
 * longer linked anywhere. We keep the path only to forward stale
 * bookmarks/links to the cockpit; /physio/patient itself handles auth,
 * session, and locale gating.
 */
export default function PhysioProgressRedirect() {
  const router = useRouter();
  const locale = useLocale();
  useEffect(() => {
    router.replace(
      locale === 'en' ? '/physio/patient' : `/${locale}/physio/patient`
    );
  }, [router, locale]);
  return <div className="min-h-dvh bg-cream" />;
}
