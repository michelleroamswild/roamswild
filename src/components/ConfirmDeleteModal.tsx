import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  itemName: string;
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-card rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-fade-in">
        <div className="p-6">
          {/* Icon */}
          <div className="flex items-center justify-center w-12 h-12 bg-destructive/10 rounded-full mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>

          {/* Content */}
          <h2 className="text-lg font-display font-semibold text-foreground text-center mb-2">
            {title}
          </h2>
          <p className="text-muted-foreground text-center mb-2">
            {description}
          </p>
          <p className="text-foreground font-medium text-center mb-6 truncate">
            "{itemName}"
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleConfirm}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
