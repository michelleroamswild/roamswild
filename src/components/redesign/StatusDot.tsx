import { ReactNode } from 'react';

/**
 * Status pill with a shape-coded dot. Shape carries meaning so colorblind
 * users can still tell statuses apart:
 *   known    → filled circle, pine
 *   derived  → diamond (rotated square), clay
 *   verified → small square, sage
 *   alert    → horizontal line, ember
 */
export type StatusKind = 'known' | 'derived' | 'verified' | 'alert';

export interface StatusDotProps {
  kind: StatusKind;
  /** Optional label override; defaults to the kind name. */
  children?: ReactNode;
  className?: string;
}

// Tailwind JIT needs full literal class names — interpolated `bg-${var}`
// won't make it to the build. Each kind has its own pre-baked classes.
const config: Record<StatusKind, {
  label: string;
  shape: 'circle' | 'diamond' | 'square' | 'line';
  ring: string;
  text: string;
  fill: string;
  border: string;
}> = {
  known:    { label: 'Known',      shape: 'circle',  ring: 'border-pine-6',   text: 'text-pine-6',  fill: 'bg-pine-6',  border: 'border-pine-6' },
  derived:  { label: 'Derived',    shape: 'diamond', ring: 'border-clay',     text: 'text-clay',    fill: 'bg-clay',    border: 'border-clay' },
  verified: { label: 'Verified',   shape: 'square',  ring: 'border-sage',     text: 'text-sage',    fill: 'bg-sage',    border: 'border-sage' },
  alert:    { label: 'Permit req', shape: 'line',    ring: 'border-ember',    text: 'text-ember',   fill: 'bg-ember',   border: 'border-ember' },
};

const Shape = ({ shape, fill, border }: { shape: 'circle' | 'diamond' | 'square' | 'line'; fill: string; border: string }) => {
  if (shape === 'circle')
    return <span className={`inline-block w-1.5 h-1.5 rounded-full ${fill}`} aria-hidden />;
  if (shape === 'diamond')
    return <span className={`inline-block w-1.5 h-1.5 ${fill} rotate-45`} aria-hidden />;
  if (shape === 'square')
    return <span className={`inline-block w-1.5 h-1.5 ${fill} rounded-[1px]`} aria-hidden />;
  return <span className={`inline-block w-2.5 h-0 border-t-2 ${border}`} aria-hidden />;
};

export const StatusDot = ({ kind, children, className = '' }: StatusDotProps) => {
  const { label, shape, ring, text, fill, border } = config[kind];
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border bg-transparent',
        'font-mono font-semibold uppercase tracking-[0.12em]',
        'text-[10px] px-2.5 py-1',
        ring, text,
        className,
      ].filter(Boolean).join(' ')}
    >
      <Shape shape={shape} fill={fill} border={border} />
      {children ?? label}
    </span>
  );
};
