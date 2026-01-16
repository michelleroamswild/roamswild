import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SpinnerGap, CheckCircle, MapPin, Jeep, Check } from '@phosphor-icons/react';
import { PotentialSpot } from '@/hooks/use-dispersed-roads';
import { useCampsites } from '@/context/CampsitesContext';
import type { RoadAccess, Campsite } from '@/types/campsite';

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

  // Check if user has already confirmed this spot when dialog opens
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
          // Reset state after dialog closes
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            {alreadyConfirmed ? 'Already Confirmed' : 'Confirm Camping Spot'}
          </DialogTitle>
        </DialogHeader>

        {checkingStatus ? (
          <div className="py-8 text-center">
            <SpinnerGap className="w-8 h-8 text-primary mx-auto mb-3 animate-spin" />
            <p className="text-sm text-muted-foreground">Checking status...</p>
          </div>
        ) : isSuccess ? (
          <div className="py-8 text-center">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
            <p className="text-lg font-medium text-foreground">Spot Confirmed!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Thank you for helping verify this location.
            </p>
          </div>
        ) : alreadyConfirmed ? (
          <div className="py-6 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-lg font-medium text-foreground">You've already confirmed this spot</p>
            <p className="text-sm text-muted-foreground mt-2">
              {existingCampsite && (
                <>
                  This spot has {existingCampsite.confirmationCount} {existingCampsite.confirmationCount === 1 ? 'confirmation' : 'confirmations'}.
                  {existingCampsite.isConfirmed ? ' It\'s now verified!' : ` ${3 - existingCampsite.confirmationCount} more needed to verify.`}
                </>
              )}
            </p>
            <Button className="mt-6" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-4">
              {/* Location Info */}
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-primary mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{spot.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {spot.lat.toFixed(5)}, {spot.lng.toFixed(5)}
                    </p>
                    {spot.roadName && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Road: {spot.roadName}
                      </p>
                    )}
                  </div>
                  <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded font-medium">
                    Score: {spot.score}
                  </span>
                </div>
              </div>

              {/* Existing confirmations */}
              {existingCampsite && existingCampsite.confirmationCount > 0 && (
                <div className="p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {existingCampsite.confirmationCount} {existingCampsite.confirmationCount === 1 ? 'person has' : 'people have'} already confirmed this spot
                  </p>
                </div>
              )}

              {/* Road Access */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Jeep className="w-4 h-4" />
                  Road Access
                </Label>
                <Select value={roadAccess} onValueChange={(v) => setRoadAccess(v as RoadAccess)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2wd">2WD Accessible</SelectItem>
                    <SelectItem value="4wd_easy">4WD Easy</SelectItem>
                    <SelectItem value="4wd_moderate">4WD Moderate</SelectItem>
                    <SelectItem value="4wd_hard">4WD Difficult</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any helpful details about this spot..."
                  rows={3}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                By confirming, you verify that this is a viable dispersed camping location.
                After 3 confirmations, this spot will be marked as a verified campsite.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Confirm Spot
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
