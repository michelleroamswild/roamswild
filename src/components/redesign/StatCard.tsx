import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Mono } from "./Mono";
import { cn } from "@/lib/utils";

export type StatCardAccent = "pine" | "sage" | "water" | "clay" | "ember";

export interface StatCardProps {
  icon: PhosphorIcon;
  label: string;
  value: number | string;
  accent?: StatCardAccent;
  className?: string;
}

const ACCENTS: Record<StatCardAccent, { bg: string; text: string }> = {
  pine: { bg: "bg-pine-6/12", text: "text-pine-6" },
  sage: { bg: "bg-sage/15", text: "text-sage" },
  water: { bg: "bg-water/15", text: "text-water" },
  clay: { bg: "bg-clay/15", text: "text-clay" },
  ember: { bg: "bg-ember/15", text: "text-ember" },
};

/**
 * Big-number metric tile. Used in dashboards (Admin waitlist counts) and
 * could be reused on Profile / MyTrips / region detail pages.
 */
export const StatCard = ({
  icon: Icon,
  label,
  value,
  accent = "pine",
  className,
}: StatCardProps) => {
  const a = ACCENTS[accent];
  return (
    <div
      className={cn(
        "bg-white dark:bg-paper-2 border border-line rounded-[14px] p-4 flex items-center gap-3",
        className,
      )}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0",
          a.bg,
          a.text,
        )}
      >
        <Icon className="w-5 h-5" weight="regular" />
      </div>
      <div className="min-w-0">
        <p className="text-[28px] font-sans font-bold tracking-[-0.02em] text-ink leading-none">
          {value}
        </p>
        <Mono className="text-ink-3 mt-1 block">{label}</Mono>
      </div>
    </div>
  );
};
