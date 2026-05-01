import { MapPin, MapPinArea, Flag, SpinnerGap } from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PlaceSearch } from '@/components/PlaceSearch';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

export type EditLocationType = 'start' | 'destination' | 'end';

interface EditLocationModalProps {
  isOpen: boolean;
  type: EditLocationType;
  currentName: string;
  pendingLocation: google.maps.places.PlaceResult | null;
  regenerating: boolean;
  onPlaceSelect: (place: google.maps.places.PlaceResult) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const EditLocationModal = ({
  isOpen,
  type,
  currentName,
  pendingLocation,
  regenerating,
  onPlaceSelect,
  onConfirm,
  onClose,
}: EditLocationModalProps) => {
  const meta =
    type === 'start' ? { Icon: MapPin,     accent: 'text-water', label: 'Start location' } :
    type === 'end'   ? { Icon: Flag,       accent: 'text-ember', label: 'End location' } :
                       { Icon: MapPinArea, accent: 'text-pine-6', label: 'Destination' };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-md border-line bg-white dark:bg-paper-2 rounded-[18px]"
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
          <Mono className={cn('flex items-center gap-1.5', meta.accent)}>
            <meta.Icon className="w-3.5 h-3.5" weight="regular" />
            {meta.label}
          </Mono>
          <DialogTitle className="font-sans font-semibold tracking-[-0.015em] text-ink text-[22px] leading-[1.15] mt-1">
            Change this location.
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="px-3 py-2.5 bg-cream dark:bg-paper-2 rounded-[12px] border border-line">
            <Mono className="text-ink-3 block">Current</Mono>
            <p className="text-[14px] font-sans font-semibold text-ink mt-0.5">{currentName}</p>
          </div>

          <PlaceSearch
            onPlaceSelect={onPlaceSelect}
            placeholder="Search for a new location…"
          />

          {pendingLocation && (
            <div className="px-3 py-2.5 bg-pine-6/[0.06] border border-pine-6/30 rounded-[12px]">
              <Mono className="text-pine-6 block">New location</Mono>
              <p className="text-[14px] font-sans font-semibold text-ink mt-0.5">
                {pendingLocation.name || pendingLocation.formatted_address}
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
              onClick={onConfirm}
              className={cn(
                '!flex-1 !justify-center',
                (!pendingLocation || regenerating) && 'opacity-50 pointer-events-none',
              )}
            >
              {regenerating ? (
                <>
                  <SpinnerGap className="w-3.5 h-3.5 animate-spin" />
                  Updating…
                </>
              ) : (
                'Change location'
              )}
            </Pill>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
