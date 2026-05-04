import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  /** Optional leading icon. */
  icon?: PhosphorIcon;
  /** Optional trailing count badge. */
  count?: number;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedControlOption<T>[];
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
}

const SIZE_CLASS = {
  sm: "text-[11px] px-2.5 py-1 h-7",
  md: "text-[13px] px-3 py-1.5 h-9",
} as const;

/**
 * Pill-row single-select. Used wherever a list of mutually-exclusive
 * filters / view modes was hand-rolled (AdminSpotReview flag pills, Index
 * Near you / Saved toggle, explorer view-mode pills, etc.).
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex flex-wrap gap-1 p-1 rounded-full bg-cream dark:bg-paper-2 border border-line",
        className,
      )}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full font-sans font-semibold tracking-[-0.005em] transition-colors",
              SIZE_CLASS[size],
              active
                ? "bg-pine-6 text-cream dark:text-ink-pine"
                : "text-ink-2 hover:text-ink hover:bg-paper",
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5" weight="regular" />}
            {opt.label}
            {opt.count !== undefined && (
              <span
                className={cn(
                  "text-[10px] font-mono ml-0.5",
                  active ? "opacity-70" : "text-ink-3",
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
