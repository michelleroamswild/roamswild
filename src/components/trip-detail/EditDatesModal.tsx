import { Calendar } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

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
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            {hasExistingStartDate ? 'Edit Trip Dates' : 'Set Trip Dates'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <DatePicker
                value={startDate}
                onChange={(date) => {
                  onStartDateChange(date);
                  if (date && endDate && date > endDate) {
                    onEndDateChange(date);
                  }
                }}
                placeholder="Select start date"
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <DatePicker
                value={endDate}
                onChange={onEndDateChange}
                placeholder="Select end date"
              />
            </div>
          </div>
          {startDate && endDate && (
            <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{getEditingDuration()} days</span>
                {' '}from{' '}
                <span className="font-medium text-foreground">
                  {startDate.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                {' '}to{' '}
                <span className="font-medium text-foreground">
                  {endDate.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </p>
              {getEditingDuration() !== currentTripDays && (
                <p className="text-sm">
                  {getEditingDuration() > currentTripDays ? (
                    <span className="text-primary">
                      +{getEditingDuration() - currentTripDays} day(s) will be added
                    </span>
                  ) : (
                    <span className="text-amber-600">
                      {currentTripDays - getEditingDuration()} day(s) will be removed
                    </span>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!startDate || !endDate}>
            Save Dates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
