import { useState } from 'react';
import { Shuffle } from '@phosphor-icons/react';
import { SurpriseMeDialog } from '@/components/SurpriseMeDialog';
import { Mono } from '@/components/redesign';

export default function SurpriseMePreview() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream dark:bg-paper flex items-center justify-center px-4 font-sans">
      <div className="text-center">
        <Mono className="text-clay block mb-2">Preview</Mono>
        <h1 className="text-[24px] font-sans font-bold tracking-[-0.02em] text-ink mb-5">
          Try the Surprise Me dialog.
        </h1>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-clay text-cream border border-clay text-[14px] font-sans font-semibold tracking-[0.01em] hover:bg-clay/90 hover:border-clay/90 transition-colors shadow-[0_8px_22px_rgba(176,80,40,.20)]"
        >
          <Shuffle className="w-4 h-4" weight="regular" />
          Surprise me
        </button>
      </div>

      <SurpriseMeDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
