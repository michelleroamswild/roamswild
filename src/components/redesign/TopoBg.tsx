import topographySvg from '@/images/topography.svg?url';

/**
 * Decorative topo background. Uses the same `/src/images/topography.svg`
 * mask as the marketing homepage (`.hero-topo`) so the visual is unified.
 * Render inside a positioned ancestor (`relative`); it absolutely fills it.
 */
export interface TopoBgProps {
  /** Stroke colour. Defaults to the earth ink for paper backgrounds; pass
   *  cream/pine when placing on a dark band. */
  color?: string;
  /** Mask opacity 0–1; default 0.15. */
  opacity?: number;
  /** Tile size in pixels; default 400 (matches `.hero-topo`). */
  scale?: number;
  className?: string;
}

export const TopoBg = ({
  color = 'hsl(var(--ink-pine))',
  opacity = 0.15,
  scale = 400,
  className = '',
}: TopoBgProps) => (
  <div
    aria-hidden
    className={`pointer-events-none absolute inset-0 ${className}`}
    style={{
      backgroundColor: color,
      WebkitMaskImage: `url("${topographySvg}")`,
      maskImage: `url("${topographySvg}")`,
      WebkitMaskSize: `${scale}px ${scale}px`,
      maskSize: `${scale}px ${scale}px`,
      WebkitMaskRepeat: 'repeat',
      maskRepeat: 'repeat',
      opacity,
    }}
  />
);
