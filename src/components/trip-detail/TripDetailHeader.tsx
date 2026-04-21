import {
  CheckCircle,
  Heart,
  ShareNetwork,
  SlidersHorizontal,
  X,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { CollaboratorAvatars } from '@/components/CollaboratorAvatars';
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
      className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="container px-3 sm:px-4 md:px-6 pt-4 pb-2.5 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={onExitClick}>
              <X className="w-5 h-5" weight="bold" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-display font-bold text-foreground truncate">
                {tripName || 'My Trip'}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {totalDays} days • {totalDistance}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {collaborators.length > 1 && (
              <CollaboratorAvatars collaborators={collaborators} size="sm" maxDisplay={4} />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={onOpenActivityEditor}
              title="Edit Activities"
            >
              <SlidersHorizontal className="w-5 h-5" weight="bold" />
            </Button>
            {isSaved && (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                onClick={onOpenShare}
              >
                <ShareNetwork className="w-5 h-5" weight="bold" />
              </Button>
            )}
            {isSaved ? (
              <button
                onClick={onUnsave}
                className="flex items-center justify-center gap-1.5 w-9 h-9 sm:w-[110px] sm:h-auto sm:py-2 text-sm font-semibold text-white bg-earth border-2 border-earth rounded-md hover:bg-earth/90 transition-colors"
              >
                <CheckCircle className="w-4 h-4" weight="fill" />
                <span className="hidden sm:inline">Saved</span>
              </button>
            ) : (
              <button
                onClick={onSave}
                className="flex items-center justify-center gap-1.5 w-9 h-9 sm:w-[110px] sm:h-auto sm:py-2 text-sm font-semibold text-earth bg-earth-light border-2 border-earth rounded-md hover:bg-earth-light/80 transition-colors"
              >
                <Heart className="w-4 h-4" weight="bold" />
                <span className="hidden sm:inline">Save Trip</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
