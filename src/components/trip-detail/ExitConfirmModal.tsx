import { Heart, Warning } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ExitConfirmModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveAndExit: () => void;
  onExitWithoutSaving: () => void;
  onCancel: () => void;
}

export const ExitConfirmModal = ({
  isOpen,
  onOpenChange,
  onSaveAndExit,
  onExitWithoutSaving,
  onCancel,
}: ExitConfirmModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warning className="w-5 h-5 text-amber-500" weight="fill" />
            Unsaved Trip
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-muted-foreground">
            This trip hasn't been saved yet. If you leave now, you'll lose all your trip details.
          </p>
          <div className="flex flex-col gap-2">
            <Button variant="primary" onClick={onSaveAndExit}>
              <Heart className="w-4 h-4 mr-2" weight="bold" />
              Save & Exit
            </Button>
            <Button variant="outline" onClick={onExitWithoutSaving}>
              Exit Without Saving
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
