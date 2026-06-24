'use client';

import { useTranslations } from 'next-intl';
import { useNavStyle } from '@/lib/useNavStyle';
import { useSetNavStyle } from '@/lib/supabase/navStyle';

/** A small wireframe preview of each layout, so the choice is visual. */
function TopPreview() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-button)] border border-stone bg-cream">
      <div className="border-b border-stone/70 px-2 py-1.5">
        <div className="h-1.5 w-2/5 rounded-full bg-ink-muted/50" />
      </div>
      <div className="flex gap-1 border-b border-stone/70 px-2 py-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-2.5 w-2.5 rounded-sm bg-sage/60" />
        ))}
      </div>
      <div className="space-y-1 px-2 py-2">
        <div className="h-1.5 w-11/12 rounded-full bg-stone" />
        <div className="h-1.5 w-3/4 rounded-full bg-stone/60" />
        <div className="h-1.5 w-5/6 rounded-full bg-stone/60" />
      </div>
    </div>
  );
}

function SidePreview() {
  return (
    <div className="flex overflow-hidden rounded-[var(--radius-button)] border border-stone bg-cream">
      <div className="flex flex-col gap-1.5 border-r border-stone/70 px-1.5 py-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-2.5 w-2.5 rounded-sm bg-sage/60" />
        ))}
      </div>
      <div className="flex-1">
        <div className="border-b border-stone/70 px-2 py-1.5">
          <div className="h-1.5 w-1/2 rounded-full bg-ink-muted/50" />
        </div>
        <div className="space-y-1 px-2 py-2">
          <div className="h-1.5 w-10/12 rounded-full bg-stone" />
          <div className="h-1.5 w-2/3 rounded-full bg-stone/60" />
          <div className="h-1.5 w-3/4 rounded-full bg-stone/60" />
        </div>
      </div>
    </div>
  );
}

/**
 * Lets a clinician choose where the patient-page action menu sits — a top
 * icon row or a left side rail — with a small illustration of each. Writes
 * the choice straight to the profile (nav_style). Used in the onboarding
 * wizard (first run) and the account menu (changeable later).
 */
export function NavStyleChooser({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('appearance');
  const current = useNavStyle();
  const setNavStyle = useSetNavStyle();

  const options: Array<{
    value: 'top' | 'side';
    label: string;
    hint: string;
    preview: React.ReactNode;
  }> = [
    {
      value: 'top',
      label: t('navStyleTop'),
      hint: t('navStyleTopHint'),
      preview: <TopPreview />
    },
    {
      value: 'side',
      label: t('navStyleSide'),
      hint: t('navStyleSideHint'),
      preview: <SidePreview />
    }
  ];

  return (
    <div>
      <p className="text-[13px] font-semibold text-ink-soft">
        {t('navStyleLabel')}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {options.map((o) => {
          const isCurrent = current === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={isCurrent}
              onClick={() => setNavStyle.mutate({ navStyle: o.value })}
              className={`rounded-[var(--radius-button)] border p-2 text-left ${
                isCurrent
                  ? 'border-sage-deep bg-sage-soft'
                  : 'border-stone bg-cream hover:bg-stone-soft'
              }`}
            >
              {o.preview}
              <p className="mt-1.5 text-[13px] font-semibold text-ink">
                {o.label}
              </p>
              {!compact && (
                <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">
                  {o.hint}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
