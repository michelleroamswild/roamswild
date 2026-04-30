import { ReactNode } from 'react';

/**
 * Small mono-caps outline tag. Used for road numbers, agency labels,
 * amenities, etc. Quieter than a Pill — no fill, no shadow ever.
 */
export interface TagProps {
  children: ReactNode;
  /** Place on dark pine band — softens border and color. */
  onDark?: boolean;
  className?: string;
}

export const Tag = ({ children, onDark = false, className = '' }: TagProps) => (
  <span
    className={[
      'inline-flex items-center gap-1 rounded-full border bg-transparent',
      'font-mono font-semibold uppercase tracking-[0.1em]',
      'text-[11px] px-2.5 py-1',
      onDark ? 'border-cream/15 text-ink-ondark' : 'border-line-2 text-ink-3',
      className,
    ].filter(Boolean).join(' ')}
  >
    {children}
  </span>
);
