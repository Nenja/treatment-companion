import type { ReactNode } from 'react';

type Tone = 'default' | 'prompt' | 'muted' | 'note';

interface CardProps {
  children: ReactNode;
  tone?: Tone;
  as?: 'div' | 'section' | 'article' | 'aside';
  className?: string;
}

const toneClasses: Record<Tone, string> = {
  default: 'bg-cream-soft border-stone',
  prompt: 'bg-sage-soft border-sage/30',
  muted: 'bg-stone-soft border-stone',
  note: 'bg-amber-soft/60 border-amber-soft'
};

export function Card({
  children,
  tone = 'default',
  as: Tag = 'section',
  className = ''
}: CardProps) {
  return (
    <Tag
      className={`rounded-[var(--radius-card)] border p-5 ${toneClasses[tone]} ${className}`}
    >
      {children}
    </Tag>
  );
}
