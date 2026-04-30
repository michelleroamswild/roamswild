import { Calendar } from '@phosphor-icons/react';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

interface EditDatesModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  hasExistingStartDate: boolean;
  startDate: Date | undefined;
  endDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
  currentTripDays: number;
  getEditingDuration: () => number;
  onSave: () => void;
  onCancel: () => void;
}

export const EditDatesModal = ({
  isOpen,
  onOpenChange,
  hasExistingStartDate,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  currentTripDays,
  getEditingDuration,
  onSave,
  onCancel,
}: EditDatesModalProps) => {
  const dur = getEditingDuration();
  const dayDelta = dur - currentTripDays;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-line bg-white rounded-[18px]">
        <DialogHeader>
          <Mono className="text-pine-6 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" weight="regular" />
            Trip dates
          </Mono>
          <DialogTitle className="font-sans font-semibold tracking-[-0.015em] text-ink text-[22px] leading-[1.15] mt-1">
            {hasExistingStartDate ? 'Edit your dates.' : 'When are you going?'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Mono className="text-ink-2 block mb-1.5">Start</Mono>
              <DatePicker
                value={startDate}
                onChange={(date) => {
                  onStartDateChange(date);
                  if (date && endDate && date > endDate) onEndDateChange(date);
                }}
                placeholder="Pick a date"
              />
            </div>
            <div>
              <Mono className="text-ink-2 block mb-1.5">End</Mono>
              <DatePicker
                value={endDate}
                onChange={onEndDateChange}
                placeholder="Pick a date"
              />
            </div>
          </div>

          {startDate && endDate && (
            <div className="p-4 bg-cream rounded-[12px] border border-line">
              <p className="text-[14px] text-ink">
                <span className="font-sans font-semibold">{dur} days</span>{' '}
                <span className="text-ink-3">from</span>{' '}
                <span className="font-sans font-semibold">
                  {startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>{' '}
                <span className="text-ink-3">to</span>{' '}
                <span className="font-sans font-semibold">
                  {endDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </p>
              {dayDelta !== 0 && (
                <p className={cn(
                  'text-[12px] font-mono uppercase tracking-[0.10em] mt-2',
                  dayDelta > 0 ? 'text-pine-6' : 'text-clay',
                )}>
                  {dayDelta > 0
                    ? `+${dayDelta} ${dayDelta === 1 ? 'day' : 'days'} will be added`
                    : `${-dayDelta} ${-dayDelta === 1 ? 'day' : 'days'} will be removed`}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2 mt-2">
          <Pill variant="ghost" mono={false} onClick={onCancel}>Cancel</Pill>
          <Pill
            variant="solid-pine"
            mono={false}
            onClick={onSave}
            className={(!startDate || !endDate) ? 'opacity-50 pointer-events-none' : ''}
          >
            Save dates
          </Pill>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
