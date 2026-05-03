import { ReactNode } from "react";
import { CheckCircle, Info, Warning, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type BannerTone = "info" | "warning" | "error" | "success";

export interface BannerProps {
  tone?: BannerTone;
  /** Bold first line. */
  title?: string;
  /** Body paragraph. Can also be supplied via children. */
  description?: string;
  children?: ReactNode;
  /** Show a dismiss X button. */
  onDismiss?: () => void;
  className?: string;
}

const TONES: Record<
  BannerTone,
  { bg: string; border: string; text: string; icon: typeof Info }
> = {
  info:    { bg: "bg-water/[0.06]",  border: "border-water/30",  text: "text-water",  icon: Info },
  warning: { bg: "bg-clay/[0.06]",   border: "border-clay/30",   text: "text-clay",   icon: Warning },
  error:   { bg: "bg-ember/[0.06]",  border: "border-ember/30",  text: "text-ember",  icon: Warning },
  success: { bg: "bg-pine-6/[0.06]", border: "border-pine-6/30", text: "text-pine-6", icon: CheckCircle },
};

/**
 * Inline non-modal feedback strip — info/warning/error/success. Drops in
 * wherever an ember-tinted div was hand-rolled (Admin error block, Profile
 * save errors, modal warnings, etc.).
 */
export const Banner = ({
  tone = "info",
  title,
  description,
  children,
  onDismiss,
  className,
}: BannerProps) => {
  const t = TONES[tone];
  const Icon = t.icon;
  const body = description ?? children;
  return (
    <div
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 px-4 py-3 rounded-[14px] border",
        t.bg,
        t.border,
        className,
      )}
    >
      <Icon className={cn("w-4 h-4 flex-shrink-0 mt-0.5", t.text)} weight="regular" />
      <div className={cn("flex-1 min-w-0 text-[13px] leading-[1.5]", t.text)}>
        {title && <p className="font-sans font-semibold tracking-[-0.005em]">{title}</p>}
        {body && <div className={title ? "mt-0.5" : ""}>{body}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={cn(
            "inline-flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 hover:bg-ink/5 transition-colors",
            t.text,
          )}
        >
          <X className="w-3.5 h-3.5" weight="bold" />
        </button>
      )}
    </div>
  );
};
