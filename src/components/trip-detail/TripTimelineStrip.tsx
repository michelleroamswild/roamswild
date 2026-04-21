import { CaretRight, PencilSimple, Plus } from '@phosphor-icons/react';
import { TripConfig } from '@/types/trip';

interface TripTimelineStripProps {
  tripConfig: TripConfig;
  onEditStart: () => void;
  onEditDestination: (index: number, currentName: string, isEndLocation: boolean) => void;
  onEditEnd: () => void;
  onAddDestination: () => void;
}

export const TripTimelineStrip = ({
  tripConfig,
  onEditStart,
  onEditDestination,
  onEditEnd,
  onAddDestination,
}: TripTimelineStripProps) => {
  if (!tripConfig.startLocation && !tripConfig.baseLocation) return null;

  return (
    <div className="bg-muted/80 border-b border-border">
      <div className="px-3 sm:px-4 md:px-6 py-2 sm:py-3">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {/* Start Location */}
          {tripConfig.startLocation && (
            <>
              <button
                onClick={onEditStart}
                className="flex items-center gap-1.5 flex-shrink-0 group hover:bg-white/50 rounded-full px-2 py-1 -mx-2 -my-1 transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-[#34b5a5]" />
                <span className="text-sm font-medium text-foreground whitespace-nowrap">
                  {tripConfig.startLocation.name.split(',')[0]}
                </span>
                <PencilSimple className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              {tripConfig.destinations.length > 0 && (
                <CaretRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
            </>
          )}

          {/* Base Location Mode */}
          {tripConfig.baseLocation && !tripConfig.startLocation && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-sm font-medium text-foreground whitespace-nowrap">
                Exploring {tripConfig.baseLocation.name.split(',')[0]}
              </span>
            </div>
          )}

          {/* Destinations */}
          {tripConfig.destinations.map((dest, index) => {
            const isLastDestination = index === tripConfig.destinations.length - 1;
            const isEndLocation = isLastDestination && !tripConfig.returnToStart;

            return (
              <div key={dest.id} className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => onEditDestination(index, dest.name, isEndLocation)}
                  className="flex items-center gap-1.5 group hover:bg-white/50 rounded-full px-2 py-1 -mx-2 -my-1 transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full ${isEndLocation ? 'bg-[#34b5a5]' : 'bg-primary'}`} />
                  <span className="text-sm font-medium text-foreground whitespace-nowrap">
                    {dest.name.split(',')[0]}
                  </span>
                  <PencilSimple className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
                {!isEndLocation && (
                  <CaretRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
              </div>
            );
          })}

          {/* Add Destination Button */}
          {(tripConfig.returnToStart || tripConfig.destinations.length === 0) && (
            <>
              <button
                onClick={onAddDestination}
                className="flex items-center gap-1.5 flex-shrink-0 group hover:bg-white/50 rounded-full px-2 py-1 -mx-2 -my-1 transition-colors"
              >
                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Add location</span>
                <Plus className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>

              {tripConfig.returnToStart && (
                <CaretRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
            </>
          )}

          {/* Return to Start / End Location */}
          {tripConfig.returnToStart && tripConfig.startLocation && (
            <button
              onClick={onEditEnd}
              className="flex items-center gap-1.5 flex-shrink-0 group hover:bg-white/50 rounded-full px-2 py-1 -mx-2 -my-1 transition-colors"
            >
              <div className="w-2 h-2 rounded-full bg-[#34b5a5]" />
              <span className="text-sm font-medium text-foreground whitespace-nowrap">
                {tripConfig.startLocation.name.split(',')[0]}
              </span>
              <PencilSimple className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
