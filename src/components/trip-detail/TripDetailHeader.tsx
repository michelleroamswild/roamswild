import {
  CheckCircle,
  Heart,
  ShareNetwork,
  SlidersHorizontal,
  X,
} from '@phosphor-icons/react';
import { CollaboratorAvatars } from '@/components/CollaboratorAvatars';
import { Mono, Pill } from '@/components/redesign';
import type { Collaborator } from '@/context/TripContext';

interface TripDetailHeaderProps {
  tripName?: string;
  totalDays: number;
  totalDistance: string;
  collaborators: Collaborator[];
  isSaved: boolean;
  onExitClick: () => void;
  onOpenActivityEditor: () => void;
  onOpenShare: () => void;
  onUnsave: () => void;
  onSave: () => void;
}

// Pine + Paper trip-detail header: cream surface with backdrop blur, mono
// meta + sans bold title, icon-button row on the right ending in a save pill
// that flips between solid-pine (Saved) and ghost (Save).
export const TripDetailHeader = ({
  tripName,
  totalDays,
  totalDistance,
  collaborators,
  isSaved,
  onExitClick,
  onOpenActivityEditor,
  onOpenShare,
  onUnsave,
  onSave,
}: TripDetailHeaderProps) => {
  return (
    <header
      className="bg-cream/95 backdrop-blur-md border-b border-line"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button
              onClick={onExitClick}
              aria-label="Close"
              className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors shrink-0"
            >
              <X className="w-4 h-4" weight="regular" />
            </button>
            <div className="min-w-0">
              <Mono className="text-pine-6">
                {totalDays} {totalDays === 1 ? 'DAY' : 'DAYS'} · {totalDistance}
              </Mono>
              <h1 className="text-[16px] sm:text-[20px] font-sans font-bold tracking-[-0.01em] text-ink truncate mt-0.5">
                {tripName || 'My trip'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {collaborators.length > 1 && (
              <div className="hidden sm:block">
                <CollaboratorAvatars collaborators={collaborators} size="sm" maxDisplay={4} />
              </div>
            )}

            <button
              onClick={onOpenActivityEditor}
              aria-label="Edit activities"
              title="Edit activities"
              className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" weight="regular" />
            </button>

            {isSaved && (
              <button
                onClick={onOpenShare}
                aria-label="Share trip"
                title="Share trip"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors"
              >
                <ShareNetwork className="w-4 h-4" weight="regular" />
              </button>
            )}

            {isSaved ? (
              <Pill variant="solid-pine" mono={false} onClick={onUnsave}>
                <CheckCircle className="w-4 h-4" weight="fill" />
                <span className="hidden sm:inline">Saved</span>
              </Pill>
            ) : (
              <Pill variant="ghost" mono={false} onClick={onSave} className="!border-pine-6 !text-pine-6 hover:!bg-pine-6/10">
                <Heart className="w-4 h-4" weight="regular" />
                <span className="hidden sm:inline">Save trip</span>
              </Pill>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
