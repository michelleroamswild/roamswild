import { Warning } from '@phosphor-icons/react';
import { Mono, Pill } from '@/components/redesign';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  itemName: string;
  /** Footnote under the item name. Defaults to a hard-delete warning;
   *  override for soft removes (e.g., "removes from your saved sites"). */
  helperText?: string;
  /** Confirmation pill copy. Default "Delete". */
  confirmLabel?: string;
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
  helperText = "This can't be undone.",
  confirmLabel = 'Delete',
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
        {/* Left-aligned layout: icon block at the top, content stacked below.
            Less alarming than the previous centered hero treatment, and reads
            naturally for soft removes (e.g. "remove from your saved sites"). */}
        <div className="p-6">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-ember/15 text-ember">
            <Warning className="w-5 h-5" weight="regular" />
          </div>

          <Mono className="text-ember mt-4 block">{title}</Mono>
          <h2 className="text-[20px] font-sans font-semibold tracking-[-0.015em] text-ink leading-[1.2] mt-1">
            {description}
          </h2>
          <p className="text-[14px] font-sans font-semibold text-ink mt-3 break-words">
            "{itemName}"
          </p>
          <p className="text-[12px] text-ink-3 mt-2 leading-[1.5]">{helperText}</p>

          <div className="mt-6 flex gap-2 justify-end">
            <Pill variant="ghost" mono={false} onClick={onClose}>
              Cancel
            </Pill>
            <Pill
              variant="ghost"
              mono={false}
              onClick={handleConfirm}
              className="!bg-ember !border-ember !text-cream hover:!bg-ember/90"
            >
              {confirmLabel}
            </Pill>
          </div>
        </div>
      </div>
    </div>
  );
}
