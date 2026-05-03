import { SpinnerGap } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl";
export type SpinnerTone = "pine" | "ink" | "ink-3" | "cream" | "current";

export interface SpinnerProps {
  size?: SpinnerSize;
  tone?: SpinnerTone;
  className?: string;
  /** Accessibility label. Defaults to a screen-reader "Loading". */
  label?: string;
}

const SIZES: Record<SpinnerSize, string> = {
  xs: "w-3 h-3",
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
  xl: "w-6 h-6",
};

const TONES: Record<SpinnerTone, string> = {
  pine: "text-pine-6",
  ink: "text-ink",
  "ink-3": "text-ink-3",
  cream: "text-cream",
  current: "",
};

/**
 * Inline loading indicator. Wraps Phosphor's SpinnerGap with size + tone
 * presets so every "loading" state in the app uses the same icon and
 * vocabulary.
 */
export const Spinner = ({
  size = "sm",
  tone = "pine",
  className,
  label = "Loading",
}: SpinnerProps) => (
  <SpinnerGap
    aria-label={label}
    role="status"
    className={cn("animate-spin", SIZES[size], TONES[tone], className)}
    weight="regular"
  />
);
