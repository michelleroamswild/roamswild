import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

// Pine + Paper slider: line-colored track, pine-6 range fill, white thumb
// with a pine-6 border. Cursor is grab by default and grabbing while pressed.
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-line">
      <SliderPrimitive.Range className="absolute h-full bg-pine-6" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className="block h-5 w-5 rounded-full border-2 border-pine-6 bg-white shadow-[0_2px_6px_rgba(29,34,24,.12)] cursor-grab active:cursor-grabbing transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine-6/30 disabled:pointer-events-none disabled:opacity-50"
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
