import { ReactNode } from "react";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface DismissibleTagProps {
  children: ReactNode;
  onDismiss: () => void;
  /** Accent — defaults to pine. Maps to start/end chip semantics elsewhere. */
  accent?: "pine" | "water" | "ember" | "clay" | "sage";
  /** Place on dark pine band — softens border and color. */
  onDark?: boolean;
  className?: string;
  /** Accessibility label for the X button. */
  dismissLabel?: string;
}

const ACCENTS: Record<NonNullable<DismissibleTagProps["accent"]>, string> = {
  pine: "border-pine-6/30 bg-pine-6/[0.06] text-pine-6",
  water: "border-water/40 bg-water/10 text-water",
  ember: "border-ember/40 bg-ember/10 text-ember",
  clay: "border-clay/40 bg-clay/10 text-clay",
  sage: "border-sage/40 bg-sage/10 text-sage",
};

/**
 * Filter / selection chip with an X to remove. Used for filter chips,
 * selected destinations on a wizard step, recipient lists, etc.
 */
export const DismissibleTag = ({
  children,
  onDismiss,
  accent = "pine",
  onDark = false,
  className,
  dismissLabel = "Remove",
}: DismissibleTagProps) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-sans font-semibold tracking-[-0.005em]",
      onDark ? "border-cream/15 bg-cream/5 text-ink-ondark" : ACCENTS[accent],
      className,
    )}
  >
    {children}
    <button
      type="button"
      onClick={onDismiss}
      aria-label={dismissLabel}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-ink/10 transition-colors -mr-0.5"
    >
      <X className="w-3 h-3" weight="bold" />
    </button>
  </span>
);
