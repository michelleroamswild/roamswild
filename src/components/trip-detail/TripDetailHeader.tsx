import {
  ArrowBendUpRight,
  ArrowsClockwise,
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
  requestedDuration?: number;
  totalDistance: string;
  collaborators: Collaborator[];
  isSaved: boolean;
  onExitClick: () => void;
  onOpenActivityEditor: () => void;
  onOpenShare: () => void;
  onUnsave: () => void;
  onSave: () => void;
  onRegenerateFromScratch?: () => void;
  regenerating?: boolean;
  reorderedDestinations?: { original: string[]; optimized: string[] };
}

// Pine + Paper trip-detail header: cream surface with backdrop blur, mono
// meta + sans bold title, icon-button row on the right ending in a save pill
// that flips between solid-pine (Saved) and ghost (Save).
export const TripDetailHeader = ({
  tripName,
  totalDays,
  requestedDuration,
  totalDistance,
  collaborators,
  isSaved,
  onExitClick,
  onOpenActivityEditor,
  onOpenShare,
  onUnsave,
  onSave,
  onRegenerateFromScratch,
  regenerating,
  reorderedDestinations,
}: TripDetailHeaderProps) => {
  const extendedByDays = requestedDuration && totalDays > requestedDuration
    ? totalDays - requestedDuration
    : 0;

  return (
    <header
      className="bg-cream/95 dark:bg-paper-2/95 backdrop-blur-md border-b border-line"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3 sm:py-4 space-y-2">
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
                {extendedByDays > 0 && (
                  <span className="ml-1.5 text-ink-3">
                    · +{extendedByDays} for safer drives
                  </span>
                )}
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

            {onRegenerateFromScratch && (
              <button
                onClick={onRegenerateFromScratch}
                disabled={regenerating}
                aria-label="Regenerate from scratch"
                title="Regenerate from scratch (replaces all days)"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowsClockwise className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} weight="regular" />
              </button>
            )}

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

        {reorderedDestinations && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-[10px] bg-water/8 text-ink-2 text-[12px] leading-[1.5]">
            <ArrowBendUpRight className="w-4 h-4 text-water flex-shrink-0 mt-0.5" weight="regular" />
            <div className="min-w-0">
              <span className="font-sans font-semibold text-ink">We reordered your stops to avoid backtracking.</span>{' '}
              <span className="text-ink-3">
                You entered: {reorderedDestinations.original.join(' → ')}.
                Routed as: {reorderedDestinations.optimized.join(' → ')}.
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
