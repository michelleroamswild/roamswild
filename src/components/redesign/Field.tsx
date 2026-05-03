import { ReactNode } from "react";
import { Mono } from "./Mono";
import { cn } from "@/lib/utils";

export interface FieldProps {
  label: string;
  /** Renders a small "Optional" mono cap next to the label. */
  optional?: boolean;
  /** Helper copy under the field. Hidden when `error` is set. */
  hint?: string;
  /** Error message under the field — replaces hint and tints ember. */
  error?: string;
  /** Input/select/etc. slot. */
  children: ReactNode;
  className?: string;
}

/**
 * Form-field wrapper: mono-cap label + optional flag + control slot +
 * helper / error line. The wizard, profile, and admin forms all hand-rolled
 * this same shape; using `<Field>` keeps every form aligned.
 */
export const Field = ({ label, optional, hint, error, children, className }: FieldProps) => (
  <div className={className}>
    <div className="flex items-center gap-2 mb-1.5">
      <Mono className="text-ink-2">{label}</Mono>
      {optional && <Mono className="text-ink-3">Optional</Mono>}
    </div>
    {children}
    {error ? (
      <p className="text-[13px] text-ember mt-1.5">{error}</p>
    ) : hint ? (
      <p className="text-[12px] text-ink-3 mt-1.5">{hint}</p>
    ) : null}
  </div>
);
