import { Warning } from '@phosphor-icons/react';
import { Mono, Pill } from '@/components/redesign';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  itemName: string;
}

// Custom modal (not shadcn Dialog) so we can keep the existing fade-in animation.
// Same chrome as the other redesigned dialogs: white card, line border,
// rounded-[18px], deep shadow, ink-pine/60 backdrop.
export function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  itemName,
}: ConfirmDeleteModalProps) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-sans">
      <div className="absolute inset-0 bg-ink-pine/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white dark:bg-paper-2 border border-line rounded-[18px] shadow-[0_18px_44px_rgba(29,34,24,.16),0_3px_8px_rgba(29,34,24,.08)] w-full max-w-md mx-4 overflow-hidden animate-fade-in">
        <div className="p-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-ember/15 text-ember mb-4">
            <Warning className="w-6 h-6" weight="regular" />
          </div>

          <Mono className="text-ember">{title}</Mono>
          <h2 className="text-[20px] font-sans font-semibold tracking-[-0.015em] text-ink leading-[1.15] mt-1">
            {description}
          </h2>
          <p className="text-[14px] font-sans font-semibold text-ink mt-3 break-words">
            "{itemName}"
          </p>
          <p className="text-[12px] text-ink-3 mt-2">This can't be undone.</p>

          <div className="mt-6 flex gap-2">
            <Pill variant="ghost" mono={false} onClick={onClose} className="!flex-1 !justify-center">
              Cancel
            </Pill>
            <Pill
              variant="ghost"
              mono={false}
              onClick={handleConfirm}
              className="!flex-1 !justify-center !bg-ember !border-ember !text-cream hover:!bg-ember/90"
            >
              Delete
            </Pill>
          </div>
        </div>
      </div>
    </div>
  );
}
