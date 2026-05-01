import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SpinnerGap, CheckCircle, MapPin, Jeep, Check } from '@phosphor-icons/react';
import { PotentialSpot } from '@/hooks/use-dispersed-roads';
import { useCampsites } from '@/context/CampsitesContext';
import type { RoadAccess, Campsite } from '@/types/campsite';
import { Mono, Pill } from '@/components/redesign';

interface ConfirmSpotDialogProps {
  spot: PotentialSpot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed?: () => void;
  existingCampsite?: Campsite | null;
}

export function ConfirmSpotDialog({ spot, open, onOpenChange, onConfirmed, existingCampsite }: ConfirmSpotDialogProps) {
  const { confirmExplorerSpot, hasUserConfirmed } = useCampsites();
  const [notes, setNotes] = useState('');
  const [roadAccess, setRoadAccess] = useState<RoadAccess>(spot.highClearance ? '4wd_moderate' : '2wd');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [alreadyConfirmed, setAlreadyConfirmed] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  useEffect(() => {
    if (open && existingCampsite) {
      setCheckingStatus(true);
      hasUserConfirmed(existingCampsite.id).then((confirmed) => {
        setAlreadyConfirmed(confirmed);
        setCheckingStatus(false);
      });
    } else {
      setAlreadyConfirmed(false);
    }
  }, [open, existingCampsite, hasUserConfirmed]);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const result = await confirmExplorerSpot(spot, notes || undefined);
      if (result) {
        setIsSuccess(true);
        setTimeout(() => {
          onOpenChange(false);
          onConfirmed?.();
          setTimeout(() => {
            setIsSuccess(false);
            setNotes('');
          }, 300);
        }, 1500);
      }
    } catch (error) {
      console.error('Failed to confirm spot:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-line bg-white rounded-[18px]">
        <DialogHeader>
          <Mono className="text-pine-6 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" weight="regular" />
            {alreadyConfirmed ? 'Already confirmed' : 'Confirm spot'}
          </Mono>
          <DialogTitle className="font-sans font-semibold tracking-[-0.015em] text-ink text-[20px] leading-[1.15] mt-1">
            {alreadyConfirmed ? "You've already confirmed this." : 'Confirm camping spot.'}
          </DialogTitle>
        </DialogHeader>

        {checkingStatus ? (
          <div className="py-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 mb-3">
              <SpinnerGap className="w-5 h-5 text-pine-6 animate-spin" />
            </div>
            <Mono className="text-pine-6">Checking status…</Mono>
          </div>
        ) : isSuccess ? (
          <div className="py-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-pine-6/15 text-pine-6 mb-3">
              <CheckCircle className="w-7 h-7" weight="fill" />
            </div>
            <Mono className="text-pine-6">Spot confirmed</Mono>
            <p className="text-[14px] text-ink-3 mt-2">Thank you for helping verify this location.</p>
          </div>
        ) : alreadyConfirmed ? (
          <div className="py-4 text-center space-y-3">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-pine-6/15 text-pine-6">
              <Check className="w-7 h-7" weight="bold" />
            </div>
            {existingCampsite && (
              <p className="text-[13px] text-ink-3 leading-[1.55] max-w-xs mx-auto">
                This spot has {existingCampsite.confirmationCount}{' '}
                {existingCampsite.confirmationCount === 1 ? 'confirmation' : 'confirmations'}.
                {existingCampsite.isConfirmed
                  ? " It's now verified."
                  : ` ${3 - existingCampsite.confirmationCount} more needed to verify.`}
              </p>
            )}
            <Pill variant="solid-pine" mono={false} onClick={() => onOpenChange(false)}>Close</Pill>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {/* Location info card */}
              <div className="px-3 py-3 bg-cream border border-line rounded-[12px]">
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-pine-6 mt-0.5 flex-shrink-0" weight="regular" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-sans font-semibold text-ink truncate">{spot.name}</p>
                    <Mono className="text-ink-3 block mt-0.5">
                      {spot.lat.toFixed(5)}, {spot.lng.toFixed(5)}
                    </Mono>
                    {spot.roadName && (
                      <Mono className="text-ink-3 block mt-0.5">Road · {spot.roadName}</Mono>
                    )}
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-pine-6/10 text-pine-6 text-[10px] font-mono font-bold">
                    {spot.score}
                  </span>
                </div>
              </div>

              {/* Existing confirmations notice */}
              {existingCampsite && existingCampsite.confirmationCount > 0 && (
                <div className="px-3 py-2.5 rounded-[10px] border border-clay/30 bg-clay/[0.06]">
                  <Mono className="text-clay">
                    {existingCampsite.confirmationCount}{' '}
                    {existingCampsite.confirmationCount === 1 ? 'person has' : 'people have'} already confirmed this spot
                  </Mono>
                </div>
              )}

              {/* Road access */}
              <div>
                <Mono className="text-ink-2 flex items-center gap-1.5 mb-1.5">
                  <Jeep className="w-3.5 h-3.5" weight="regular" />
                  Road access
                </Mono>
                <Select value={roadAccess} onValueChange={(v) => setRoadAccess(v as RoadAccess)}>
                  <SelectTrigger className="h-10 rounded-[12px] border-line bg-white text-ink text-[14px] hover:border-ink-3 transition-colors">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-[12px] border-line bg-white [&_[data-highlighted]]:bg-cream [&_[data-highlighted]]:text-ink">
                    <SelectItem value="2wd">2WD accessible</SelectItem>
                    <SelectItem value="4wd_easy">4WD easy</SelectItem>
                    <SelectItem value="4wd_moderate">4WD moderate</SelectItem>
                    <SelectItem value="4wd_hard">4WD difficult</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div>
                <Mono className="text-ink-2 block mb-1.5">Notes (optional)</Mono>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any helpful details about this spot…"
                  rows={3}
                  className="w-full px-3 py-2 rounded-[12px] border border-line bg-white text-ink text-[14px] outline-none placeholder:text-ink-3 focus:border-pine-6 transition-colors resize-none"
                />
              </div>

              <p className="text-[12px] text-ink-3 leading-[1.5]">
                By confirming, you verify this is a viable dispersed camping location. After 3 confirmations, this spot
                will be marked as a verified campsite.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-2 mt-2">
              <Pill variant="ghost" mono={false} onClick={() => onOpenChange(false)}>
                Cancel
              </Pill>
              <Pill
                variant="solid-pine"
                mono={false}
                onClick={handleConfirm}
                className={isSubmitting ? 'opacity-50 pointer-events-none' : ''}
              >
                {isSubmitting ? (
                  <>
                    <SpinnerGap className="w-3.5 h-3.5 animate-spin" />
                    Confirming…
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" weight="regular" />
                    Confirm spot
                  </>
                )}
              </Pill>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
