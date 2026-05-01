import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-bold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Main button hierarchy
        primary: "bg-primary text-primary-foreground hover:bg-forest shadow-md hover:shadow-lg hover:-translate-y-px",
        secondary: "bg-white text-primary-dark border-2 border-primary hover:bg-primary hover:text-primary-foreground dark:bg-transparent dark:text-primary dark:border-primary dark:hover:bg-primary dark:hover:text-primary-foreground shadow-md hover:shadow-lg hover:-translate-y-px",
        tertiary: "text-primary border-2 border-primary/30 hover:border-primary hover:bg-primary/5",
        // Utility variants
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Chip variants for filters
        chip: "bg-cream text-ink-2 border border-line rounded-full text-xs font-medium hover:border-ink-3/50 hover:bg-paper-2",
        "chip-active": "bg-pine-6 text-cream rounded-full text-xs font-medium shadow-sm",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-11 rounded-md px-5 py-2.5",
        lg: "h-12 rounded-lg px-8 text-base",
        xl: "h-14 rounded-xl px-10 text-lg",
        icon: "h-10 w-10",
        chip: "h-8 px-4 py-1",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
