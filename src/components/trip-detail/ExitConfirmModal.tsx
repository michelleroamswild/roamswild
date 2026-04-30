import { Heart, Warning } from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Mono, Pill } from '@/components/redesign';

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
      <DialogContent className="sm:max-w-md border-line bg-white rounded-[18px]">
        <DialogHeader>
          <Mono className="text-clay flex items-center gap-1.5">
            <Warning className="w-3.5 h-3.5" weight="regular" />
            Unsaved trip
          </Mono>
          <DialogTitle className="font-sans font-semibold tracking-[-0.015em] text-ink text-[22px] leading-[1.15] mt-1">
            Save before leaving?
          </DialogTitle>
        </DialogHeader>
        <p className="text-[14px] text-ink-3 leading-[1.55]">
          This trip hasn't been saved yet. If you leave now, you'll lose all your trip details.
        </p>
        <div className="flex flex-col gap-2 mt-2">
          <Pill variant="solid-pine" mono={false} onClick={onSaveAndExit} className="!w-full !justify-center">
            <Heart className="w-3.5 h-3.5" weight="regular" />
            Save & exit
          </Pill>
          <Pill variant="ghost" mono={false} onClick={onExitWithoutSaving} className="!w-full !justify-center !text-ember !border-ember/40 hover:!bg-ember/10">
            Exit without saving
          </Pill>
          <Pill variant="ghost" mono={false} onClick={onCancel} className="!w-full !justify-center !border-transparent">
            Cancel
          </Pill>
        </div>
      </DialogContent>
    </Dialog>
  );
};
