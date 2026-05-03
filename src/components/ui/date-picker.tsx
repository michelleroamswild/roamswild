import * as React from "react";
import { format } from "date-fns";
import { CalendarBlank } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative w-full h-12 pl-11 pr-4 rounded-[14px] border border-line bg-white dark:bg-paper-2 text-left text-[15px] text-ink outline-none transition-colors",
            "focus:border-pine-6 data-[state=open]:border-pine-6 hover:border-ink-3/40",
            !value && "text-ink-3",
            className,
          )}
        >
          <CalendarBlank
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3"
            weight="regular"
          />
          {value ? format(value, "MMM d, yyyy") : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 border-line bg-white dark:bg-paper-2 rounded-[14px]"
        align="start"
      >
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onChange?.(date);
            setOpen(false);
          }}
          initialFocus
          className="pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}
