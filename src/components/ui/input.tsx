import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-[12px] border border-line bg-white px-3 py-2 text-[14px] text-ink font-sans tracking-[-0.005em] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink placeholder:text-ink-3 outline-none focus:border-pine-6 disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
