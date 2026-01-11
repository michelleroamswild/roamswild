import * as React from "react";
import { Clock } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface TimePickerProps {
  value?: string; // HH:MM format
  onChange?: (time: string) => void;
  placeholder?: string;
  className?: string;
}

const hours = Array.from({ length: 12 }, (_, i) => i + 1);
const minutes = ["00", "15", "30", "45"];

export function TimePicker({
  value = "08:00",
  onChange,
  placeholder = "Pick a time",
  className,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Parse the value
  const parseTime = (timeStr: string) => {
    const [hourStr, minuteStr] = timeStr.split(":");
    let hour = parseInt(hourStr, 10);
    const minute = minuteStr || "00";
    const isPM = hour >= 12;
    if (hour > 12) hour -= 12;
    if (hour === 0) hour = 12;
    return { hour, minute, isPM };
  };

  const { hour: selectedHour, minute: selectedMinute, isPM } = parseTime(value);
  const [period, setPeriod] = React.useState<"AM" | "PM">(isPM ? "PM" : "AM");

  const formatDisplay = (timeStr: string) => {
    const { hour, minute, isPM } = parseTime(timeStr);
    return `${hour}:${minute} ${isPM ? "PM" : "AM"}`;
  };

  const handleTimeSelect = (hour: number, minute: string, newPeriod?: "AM" | "PM") => {
    const usePeriod = newPeriod || period;
    let hour24 = hour;
    if (usePeriod === "PM" && hour !== 12) hour24 += 12;
    if (usePeriod === "AM" && hour === 12) hour24 = 0;
    const timeStr = `${hour24.toString().padStart(2, "0")}:${minute}`;
    onChange?.(timeStr);
  };

  const handlePeriodChange = (newPeriod: "AM" | "PM") => {
    setPeriod(newPeriod);
    handleTimeSelect(selectedHour, selectedMinute, newPeriod);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-12 w-full rounded-xl border border-input bg-white px-4 justify-start text-left font-normal text-base hover:bg-white hover:border-primary hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary transition-colors",
            !value && "text-muted-foreground",
            className
          )}
        >
          <Clock className="mr-2 h-4 w-4 text-[hsl(var(--forest))]" />
          {value ? formatDisplay(value) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4 bg-white" align="start">
        <div className="flex gap-4">
          {/* Hours */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground text-center">Hour</div>
            <div className="grid grid-cols-3 gap-1">
              {hours.map((hour) => (
                <button
                  key={hour}
                  onClick={() => handleTimeSelect(hour, selectedMinute)}
                  className={cn(
                    "h-8 w-8 rounded-md text-sm font-medium transition-colors",
                    selectedHour === hour
                      ? "bg-[hsl(var(--forest))] text-white"
                      : "hover:bg-muted"
                  )}
                >
                  {hour}
                </button>
              ))}
            </div>
          </div>

          {/* Minutes */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground text-center">Min</div>
            <div className="grid grid-cols-1 gap-1">
              {minutes.map((minute) => (
                <button
                  key={minute}
                  onClick={() => handleTimeSelect(selectedHour, minute)}
                  className={cn(
                    "h-8 w-12 rounded-md text-sm font-medium transition-colors",
                    selectedMinute === minute
                      ? "bg-[hsl(var(--forest))] text-white"
                      : "hover:bg-muted"
                  )}
                >
                  :{minute}
                </button>
              ))}
            </div>
          </div>

          {/* AM/PM */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground text-center">&nbsp;</div>
            <div className="grid grid-cols-1 gap-1">
              <button
                onClick={() => handlePeriodChange("AM")}
                className={cn(
                  "h-8 w-12 rounded-md text-sm font-medium transition-colors",
                  period === "AM"
                    ? "bg-[hsl(var(--forest))] text-white"
                    : "hover:bg-muted"
                )}
              >
                AM
              </button>
              <button
                onClick={() => handlePeriodChange("PM")}
                className={cn(
                  "h-8 w-12 rounded-md text-sm font-medium transition-colors",
                  period === "PM"
                    ? "bg-[hsl(var(--forest))] text-white"
                    : "hover:bg-muted"
                )}
              >
                PM
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
