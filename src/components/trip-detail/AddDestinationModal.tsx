import { MapPinArea, SpinnerGap, Plus } from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PlaceSearch } from '@/components/PlaceSearch';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

interface AddDestinationModalProps {
  isOpen: boolean;
  pendingDestination: google.maps.places.PlaceResult | null;
  regenerating: boolean;
  onPlaceSelect: (place: google.maps.places.PlaceResult) => void;
  onAdd: () => void;
  onClose: () => void;
}

export const AddDestinationModal = ({
  isOpen,
  pendingDestination,
  regenerating,
  onPlaceSelect,
  onAdd,
  onClose,
}: AddDestinationModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-md border-line bg-white rounded-[18px]"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.pac-container') || target.closest('.pac-item')) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.pac-container') || target.closest('.pac-item')) e.preventDefault();
        }}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <Mono className="text-pine-6 flex items-center gap-1.5">
            <MapPinArea className="w-3.5 h-3.5" weight="regular" />
            Add destination
          </Mono>
          <DialogTitle className="font-sans font-semibold tracking-[-0.015em] text-ink text-[22px] leading-[1.15] mt-1">
            Where else are you going?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <PlaceSearch
            onPlaceSelect={onPlaceSelect}
            placeholder="Search for a destination…"
          />

          {pendingDestination && (
            <div className="px-3 py-2.5 bg-pine-6/[0.06] border border-pine-6/30 rounded-[12px]">
              <Mono className="text-pine-6 block">New destination</Mono>
              <p className="text-[14px] font-sans font-semibold text-ink mt-0.5">
                {pendingDestination.name || pendingDestination.formatted_address}
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Pill variant="ghost" mono={false} onClick={onClose} className="!flex-1 !justify-center">
              Cancel
            </Pill>
            <Pill
              variant="solid-pine"
              mono={false}
              onClick={onAdd}
              className={cn(
                '!flex-1 !justify-center',
                (!pendingDestination || regenerating) && 'opacity-50 pointer-events-none',
              )}
            >
              {regenerating ? (
                <>
                  <SpinnerGap className="w-3.5 h-3.5 animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" weight="bold" />
                  Add destination
                </>
              )}
            </Pill>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
