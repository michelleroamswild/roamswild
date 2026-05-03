import * as React from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium text-ink",
        nav: "space-x-1 flex items-center",
        nav_button: "inline-flex items-center justify-center h-7 w-7 rounded-md border border-line bg-transparent p-0 text-ink-2 opacity-60 hover:opacity-100 hover:bg-water/10 transition-colors",
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-ink-3 rounded-md w-9 font-mono uppercase tracking-[0.10em] text-[11px]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-water/40 [&:has([aria-selected])]:bg-water first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: "inline-flex items-center justify-center h-9 w-9 p-0 rounded-md text-sm font-normal text-ink hover:bg-water/35 hover:text-ink transition-colors aria-selected:opacity-100",
        day_range_end: "day-range-end",
        day_selected:
          "bg-water text-white hover:bg-water hover:text-white focus:bg-water focus:text-white",
        day_today: "bg-water/15 text-ink font-semibold",
        day_outside:
          "day-outside text-ink-3 opacity-50 aria-selected:bg-water/40 aria-selected:text-ink-3 aria-selected:opacity-30",
        day_disabled: "text-ink-3 opacity-50",
        day_range_middle: "aria-selected:bg-water/40 aria-selected:text-ink",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <CaretLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <CaretRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
