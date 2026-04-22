import { Funnel, NavigationArrow, Star, Tent, Users } from '@phosphor-icons/react';
import { Card, CardContent } from '@/components/ui/card';
import { PotentialSpot, EstablishedCampground } from '@/hooks/use-dispersed-roads';
import type { Campsite } from '@/types/campsite';
import type { UnifiedSpot } from './types';

const getUnifiedSpotIcon = (spot: UnifiedSpot) => {
  if (spot.category === 'campground') {
    return <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />;
  }
  if (spot.category === 'mine') {
    return <Tent className="w-3.5 h-3.5 text-wildviolet flex-shrink-0" weight="fill" />;
  }
  if (spot.category === 'friend') {
    return <Users className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" weight="fill" />;
  }
  if (spot.spotType === 'camp-site') {
    return <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#3d7a40' }} />;
  }
  if (spot.score && spot.score >= 35) {
    return <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#eab308' }} />;
  }
  if (spot.score && spot.score >= 25) {
    return <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#f97316' }} />;
  }
  return <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#e83a3a' }} />;
};

const getScoreColor = (score: number) => {
  if (score >= 35) return 'text-amber-800 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30';
  if (score >= 25) return 'text-orange-800 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/30';
  return 'text-red-800 bg-red-100 dark:text-red-300 dark:bg-red-900/30';
};

interface SpotResultsListProps {
  unifiedSpotList: UnifiedSpot[];
  spotsToShow: number;
  selectedSpot: PotentialSpot | null;
  selectedCampground: EstablishedCampground | null;
  selectedCampsite: Campsite | null;
  hasFilters: boolean;
  onClickSpot: (spot: UnifiedSpot) => void;
  onClearFilters: () => void;
  onShowMore: () => void;
  onShowLess: () => void;
}

export const SpotResultsList = ({
  unifiedSpotList,
  spotsToShow,
  selectedSpot,
  selectedCampground,
  selectedCampsite,
  hasFilters,
  onClickSpot,
  onClearFilters,
  onShowMore,
  onShowLess,
}: SpotResultsListProps) => {
  if (unifiedSpotList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Funnel className="w-10 h-10 mb-3 opacity-50" />
        <p className="text-base text-center font-medium">No campsites match your filters</p>
        <p className="text-sm mt-1.5 opacity-75">Try adjusting your filters above</p>
        {hasFilters && (
          <button
            onClick={onClearFilters}
            className="mt-3 text-sm text-primary hover:underline font-medium"
          >
            Clear all filters
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {unifiedSpotList.slice(0, spotsToShow).map((spot) => {
          const isSelected =
            (spot.category === 'derived' && selectedSpot?.id === spot.originalSpot?.id) ||
            (spot.category === 'campground' && selectedCampground?.id === spot.originalCampground?.id) ||
            (spot.category === 'mine' && selectedCampsite?.id === spot.originalCampsite?.id) ||
            (spot.category === 'friend' && selectedCampsite?.id === spot.originalCampsite?.id);

          return (
            <Card
              key={spot.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                isSelected
                  ? 'ring-2 ring-primary shadow-md'
                  : spot.isRecommended
                    ? 'border-primary/30 bg-primary/5'
                    : ''
              }`}
              onClick={() => onClickSpot(spot)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-2.5">
                  {getUnifiedSpotIcon(spot)}
                  <span className="text-base font-medium text-foreground truncate flex-1">{spot.name}</span>
                  {spot.isRecommended && (
                    <Star className="w-4 h-4 text-primary flex-shrink-0" weight="fill" />
                  )}
                  {spot.category === 'derived' && spot.score !== undefined && (
                    <span className={`text-sm px-2 py-0.5 rounded font-medium ${getScoreColor(spot.score)}`}>
                      {spot.score}
                    </span>
                  )}
                  {spot.category === 'campground' && spot.reservable && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">Reserve</span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                  {spot.distance !== undefined && spot.distance < 100 && (
                    <span className="flex items-center gap-1">
                      <NavigationArrow className="w-3.5 h-3.5" />
                      {spot.distance.toFixed(1)} mi
                    </span>
                  )}
                  {spot.category === 'derived' && spot.reasons && spot.reasons.slice(0, 2).map((reason, i) => (
                    <span key={i} className="bg-muted px-2 py-0.5 rounded">{reason}</span>
                  ))}
                  {spot.category === 'campground' && spot.facilityType && (
                    <span>{spot.facilityType}</span>
                  )}
                  {spot.category === 'mine' && spot.campsiteType && (
                    <span>{spot.campsiteType}</span>
                  )}
                  {spot.category === 'friend' && spot.sharedBy && (
                    <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded">
                      Shared by {spot.sharedBy}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {unifiedSpotList.length > 30 && (
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {Math.min(spotsToShow, unifiedSpotList.length)} of {unifiedSpotList.length}
          </p>
          <div className="flex gap-2">
            {spotsToShow < unifiedSpotList.length && (
              <button
                onClick={onShowMore}
                className="text-sm text-primary hover:underline font-medium"
              >
                Show More
              </button>
            )}
            {spotsToShow > 30 && (
              <button
                onClick={onShowLess}
                className="text-sm text-muted-foreground hover:underline"
              >
                Show Less
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
