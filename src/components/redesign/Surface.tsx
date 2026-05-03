import { forwardRef, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type SurfaceVariant = "default" | "paper" | "pine-tinted" | "ink-pine";
export type SurfacePadding = "none" | "sm" | "md" | "lg";

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual surface tone.
   *   - default     → white card on cream pages
   *   - paper       → recedes into the page bg (e.g. inner sections)
   *   - pine-tinted → "preset"/"saved data" highlight (matches the rig card)
   *   - ink-pine    → dark surface for hero/dark-band cards */
  variant?: SurfaceVariant;
  /** Internal padding preset. Use `none` when wrapping content with its own padding. */
  padding?: SurfacePadding;
}

const VARIANTS: Record<SurfaceVariant, string> = {
  default: "bg-white dark:bg-paper-2 border border-line text-ink",
  paper: "bg-paper dark:bg-paper-2 border border-line text-ink",
  "pine-tinted": "bg-pine-6/[0.06] dark:bg-pine-6/[0.10] border border-pine-6/25 text-ink",
  "ink-pine": "bg-ink-pine border border-ink-pine text-cream",
};

const PADDING: Record<SurfacePadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

/**
 * Card-style container that codifies the redesign's most-used surface
 * pattern (`bg-white border border-line rounded-[14px]`). Replaces inline
 * copies of those classes across every page.
 */
export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ variant = "default", padding = "md", className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-[14px]", VARIANTS[variant], PADDING[padding], className)}
      {...props}
    />
  ),
);
Surface.displayName = "Surface";
