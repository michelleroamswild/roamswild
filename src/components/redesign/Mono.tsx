import { ReactNode } from 'react';

/**
 * Uppercase mono label — used for meta info, section labels, coordinates.
 * Spec: JetBrains Mono, .14em letter-spacing, ink-3 color by default.
 */
export interface MonoProps {
  children: ReactNode;
  className?: string;
  /** Override letter-spacing if you need a tighter look (default '.12em'). */
  tracking?: string;
  /** Pixel size; default 12. Common values: 11 / 12 / 13 / 14. */
  size?: number;
}

export const Mono = ({ children, className = '', tracking = '0.12em', size = 12 }: MonoProps) => (
  <span
    className={`font-mono font-medium uppercase ${className}`}
    style={{ fontSize: size, letterSpacing: tracking }}
  >
    {children}
  </span>
);
