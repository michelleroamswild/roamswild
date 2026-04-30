import { ReactNode } from 'react';

/**
 * Single pill primitive — full-round, one shape.
 * Variants follow the redesign style guide:
 *   solid-ink   — primary action on paper (e.g. "Open map")
 *   solid-pine  — accent CTA ("Find camps near me")
 *   ghost       — secondary, ink-on-paper
 *   accent      — soft pine fill, pine border ("Save region")
 *   clay        — supporting status, "derived/unverified"
 *   cream       — solid CTA on dark band
 */
export type PillVariant = 'solid-ink' | 'solid-pine' | 'ghost' | 'accent' | 'pine-soft' | 'clay' | 'cream';

export interface PillProps {
  children: ReactNode;
  variant?: PillVariant;
  /** Smaller padding + 11px font; default is 13px / 10px-18px padding. */
  sm?: boolean;
  /** Render mono caps (default true — matches the design's monoLabels=on tweak). */
  mono?: boolean;
  /** Adjust foreground/border for placement on the dark pine band. */
  onDark?: boolean;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  as?: 'span' | 'button';
}

// Primary CTAs (`solid-*`) get a clear lift on hover: shadow + small upward
// translate + a meaningful color shift. Active/pressed flattens back down.
// Secondary variants keep a quieter hover so primary stays visually dominant.
const variantClasses: Record<PillVariant, string> = {
  'solid-ink':
    'bg-ink text-cream border-ink shadow-[0_1px_2px_rgba(29,34,24,.08)] ' +
    'hover:bg-ink-2 hover:border-ink-2 hover:shadow-[0_10px_24px_rgba(29,34,24,.22)] hover:-translate-y-px ' +
    'active:translate-y-0 active:bg-ink-pine active:shadow-[0_1px_2px_rgba(29,34,24,.12)]',
  'solid-pine':
    'bg-pine-6 text-cream border-pine-6 shadow-[0_1px_2px_rgba(29,34,24,.08)] ' +
    'hover:bg-pine-5 hover:border-pine-5 hover:shadow-[0_10px_24px_rgba(58,74,42,.30)] hover:-translate-y-px ' +
    'active:translate-y-0 active:bg-pine-7 active:shadow-[0_1px_2px_rgba(29,34,24,.12)]',
  ghost:
    'bg-transparent text-ink border-line-2 hover:bg-cream hover:border-ink-3 active:bg-paper-2',
  accent:
    'bg-pine-6/10 text-pine-6 border-pine-6 hover:bg-pine-6/20 active:bg-pine-6/25',
  // Light solid pine fill — used for the quick-action pills under the hero
  // search where we want a friendly, opaque colour rather than translucent.
  'pine-soft':
    'bg-pine-1 text-pine-7 border-pine-2 hover:bg-pine-2 hover:border-pine-3 active:bg-pine-2/80',
  clay:
    'bg-clay/15 text-clay border-clay hover:bg-clay/25 active:bg-clay/30',
  cream:
    'bg-cream/10 text-cream border-cream/30 hover:bg-cream/20 hover:border-cream/50 active:bg-cream/25',
};

export const Pill = ({
  children,
  variant = 'ghost',
  sm = false,
  mono = true,
  onDark = false,
  className = '',
  onClick,
  type = 'button',
  as,
}: PillProps) => {
  const Tag = (as ?? (onClick ? 'button' : 'span')) as 'span' | 'button';

  // On-dark surfaces tweak ghost/cream to keep contrast right
  const tone = onDark && variant === 'ghost'
    ? 'bg-transparent text-cream border-cream/25 hover:bg-cream/10'
    : variantClasses[variant];

  const sizing = sm
    ? 'text-[10px] px-2.5 py-1 gap-1.5'
    : 'text-[12px] px-4 py-2 gap-1.5';

  const typography = mono
    ? 'font-mono font-semibold uppercase tracking-[0.12em]'
    : 'font-sans font-semibold tracking-[0.01em]';

  return (
    <Tag
      type={Tag === 'button' ? type : undefined}
      onClick={onClick}
      className={[
        'inline-flex items-center rounded-full border transition-all duration-150',
        'will-change-transform',
        sizing,
        typography,
        tone,
        onClick ? 'cursor-pointer' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </Tag>
  );
};
