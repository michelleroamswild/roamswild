import { MapPin, MapPinArea } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PlaceSearch } from '@/components/PlaceSearch';

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
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.pac-container') || target.closest('.pac-item')) {
            e.preventDefault();
          }
        }}
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.pac-container') || target.closest('.pac-item')) {
            e.preventDefault();
          }
        }}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === 'start' || type === 'end' ? (
              <MapPin className="w-5 h-5 text-aquateal" />
            ) : (
              <MapPinArea className="w-5 h-5 text-lavenderslate" />
            )}
            {type === 'start'
              ? 'Change Start Location'
              : type === 'end'
              ? 'Change End Location'
              : 'Change Destination'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Current: <span className="font-medium text-foreground">{currentName}</span>
          </p>
          <PlaceSearch
            onPlaceSelect={onPlaceSelect}
            placeholder="Search for a new location..."
          />
          {pendingLocation && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-sm text-muted-foreground">New location:</p>
              <p className="font-medium text-foreground">
                {pendingLocation.name || pendingLocation.formatted_address}
              </p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={onConfirm}
              disabled={!pendingLocation || regenerating}
              className="flex-1"
            >
              {regenerating ? 'Updating...' : 'Change Location'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
