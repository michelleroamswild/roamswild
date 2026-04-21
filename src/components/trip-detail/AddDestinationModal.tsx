import { MapPinArea } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PlaceSearch } from '@/components/PlaceSearch';

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
            <MapPinArea className="w-5 h-5 text-lavenderslate" />
            Add Destination
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <PlaceSearch
            onPlaceSelect={onPlaceSelect}
            placeholder="Search for a destination..."
          />
          {pendingDestination && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-sm text-muted-foreground">New destination:</p>
              <p className="font-medium text-foreground">
                {pendingDestination.name || pendingDestination.formatted_address}
              </p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={onAdd}
              disabled={!pendingDestination || regenerating}
              className="flex-1"
            >
              {regenerating ? 'Adding...' : 'Add Destination'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
