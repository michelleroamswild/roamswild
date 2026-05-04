import { ReactNode } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Mono } from "./Mono";
import { cn } from "@/lib/utils";

export type EmptyStateAccent = "pine" | "sage" | "water" | "clay" | "ember";

export interface EmptyStateProps {
  /** Phosphor icon for the centered icon block. */
  icon?: PhosphorIcon;
  /** Mono cap above the title. Optional — useful for "Saved trips" / etc. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Action slot — pass a Pill, Link button, etc. */
  action?: ReactNode;
  /** Accent for the icon block + eyebrow. */
  accent?: EmptyStateAccent;
  className?: string;
}

const ACCENTS: Record<EmptyStateAccent, { bg: string; text: string }> = {
  pine: { bg: "bg-pine-6/12", text: "text-pine-6" },
  sage: { bg: "bg-sage/15", text: "text-sage" },
  water: { bg: "bg-water/15", text: "text-water" },
  clay: { bg: "bg-clay/15", text: "text-clay" },
  ember: { bg: "bg-ember/15", text: "text-ember" },
};

/**
 * "No data yet" / "Empty list" affordance — title + description + optional
 * accent icon block + optional action. Replaces ad-hoc empty treatments
 * across MyTrips, Friends, SavedLocations, Admin (no waitlist), and the
 * dispersed-explorer "no spots in viewport" state.
 */
export const EmptyState = ({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  accent = "pine",
  className,
}: EmptyStateProps) => {
  const a = ACCENTS[accent];
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-12 px-6", className)}>
      {Icon && (
        <div className={cn("inline-flex items-center justify-center w-12 h-12 rounded-full mb-3", a.bg, a.text)}>
          <Icon className="w-5 h-5" weight="regular" />
        </div>
      )}
      {eyebrow && <Mono className={a.text}>{eyebrow}</Mono>}
      <h3 className="font-sans font-bold tracking-[-0.015em] text-ink text-[18px] mt-1">{title}</h3>
      {description && (
        <p className="text-[13px] text-ink-3 mt-1.5 max-w-[320px] leading-[1.55]">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};
