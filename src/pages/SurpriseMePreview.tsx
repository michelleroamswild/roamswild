import { useState } from 'react';
import { Shuffle } from '@phosphor-icons/react';
import { SurpriseMeDialog } from '@/components/SurpriseMeDialog';

export default function SurpriseMePreview() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-accent text-accent-foreground text-lg font-semibold hover:bg-accent/80 transition-colors shadow-sm"
        >
          <Shuffle className="w-5 h-5" weight="bold" />
          Surprise me
        </button>
      </div>

      <SurpriseMeDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
