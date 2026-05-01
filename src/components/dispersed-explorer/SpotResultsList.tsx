import { Funnel, NavigationArrow, Star, Tent, Users } from '@phosphor-icons/react';
import { PotentialSpot, EstablishedCampground } from '@/hooks/use-dispersed-roads';
import type { Campsite } from '@/types/campsite';
import type { UnifiedSpot } from './types';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

// Pin badge for the leading column. Always w-2 h-2 so the row aligns
// regardless of which type/score the spot is.
const SpotDot = ({ spot }: { spot: UnifiedSpot }) => {
  if (spot.category === 'campground') return <span className="w-2 h-2 rounded-full bg-pin-campground flex-shrink-0" />;
  if (spot.category === 'mine')       return <Tent className="w-3 h-3 text-pine-6 flex-shrink-0" weight="fill" />;
  if (spot.category === 'friend')     return <Users className="w-3 h-3 text-sage flex-shrink-0" weight="fill" />;
  if (spot.spotType === 'camp-site')  return <span className="w-2 h-2 rounded-full bg-pin-safe flex-shrink-0" />;
  if (spot.score && spot.score >= 35) return <span className="w-2 h-2 rounded-full bg-pin-easy flex-shrink-0" />;
  if (spot.score && spot.score >= 25) return <span className="w-2 h-2 rounded-full bg-pin-moderate flex-shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-pin-hard flex-shrink-0" />;
};

// Build the "subtitle" line: agency / facility type / shared-by, etc. Returns
// the parts that compose the mono "distance · sub" line under each row.
const subtitleFor = (spot: UnifiedSpot): string => {
  if (spot.category === 'campground') return spot.facilityType ? `Campground · ${spot.facilityType}` : 'Campground';
  if (spot.category === 'mine')       return spot.campsiteType ? `My site · ${spot.campsiteType}` : 'My site';
  if (spot.category === 'friend')     return spot.sharedBy ? `Shared by ${spot.sharedBy}` : 'Shared site';
  if (spot.spotType === 'camp-site')  return 'Known campsite';
  return spot.reasons?.[0] ?? 'Derived spot';
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
      <div className="border border-dashed border-line dark:border-line-2 bg-white/50 dark:bg-paper/50 rounded-[14px] mx-4 my-4 px-6 py-12 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 text-pine-6 mb-3">
          <Funnel className="w-5 h-5" weight="regular" />
        </div>
        <p className="text-[14px] font-sans font-semibold text-ink">No campsites match your filters</p>
        <p className="text-[13px] text-ink-3 mt-1">Try loosening or removing a filter.</p>
        {hasFilters && (
          <div className="mt-4">
            <Pill variant="ghost" sm mono={false} onClick={onClearFilters}>
              Clear all filters
            </Pill>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Flat row list — first row has no top border, subsequent rows divide
          on a thin line. Selection state tints the whole row, no card chrome. */}
      <div>
        {unifiedSpotList.slice(0, spotsToShow).map((spot, i) => {
          const isSelected =
            (spot.category === 'derived'    && selectedSpot?.id      === spot.originalSpot?.id) ||
            (spot.category === 'campground' && selectedCampground?.id === spot.originalCampground?.id) ||
            (spot.category === 'mine'       && selectedCampsite?.id   === spot.originalCampsite?.id) ||
            (spot.category === 'friend'     && selectedCampsite?.id   === spot.originalCampsite?.id);

          const distanceText = spot.distance !== undefined && spot.distance < 100
            ? `${spot.distance.toFixed(1)} mi`
            : null;
          const subtitle = subtitleFor(spot);

          return (
            <button
              key={spot.id}
              onClick={() => onClickSpot(spot)}
              className={cn(
                'group w-full text-left px-4 py-3 transition-colors flex items-start gap-3',
                i > 0 && 'border-t border-line',
                isSelected ? 'bg-pine-6/[0.06]' : 'hover:bg-white/60 dark:hover:bg-paper/60',
              )}
            >
              {/* Content column */}
              <div className="flex-1 min-w-0">
                {/* Title row — pin dot + name + recommended star */}
                <div className="flex items-center gap-2">
                  <SpotDot spot={spot} />
                  <span className={cn(
                    'flex-1 text-[13px] font-sans font-semibold tracking-[-0.01em] truncate',
                    isSelected ? 'text-pine-6' : 'text-ink',
                  )}>
                    {spot.name}
                  </span>
                  {spot.isRecommended && (
                    <Star className="w-3 h-3 text-pine-6 flex-shrink-0" weight="fill" />
                  )}
                </div>

                {/* Mono meta line — "distance · subtitle" */}
                <Mono className="text-ink-3 block mt-0.5">
                  {[distanceText, subtitle].filter(Boolean).join(' · ')}
                </Mono>

                {/* Tag pills row — accent for road/access, ghost for "Reserve", etc. */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {spot.category === 'derived' && spot.reasons?.slice(0, 2).map((reason) => (
                    <RowPill key={reason} variant="accent">{reason}</RowPill>
                  ))}
                  {spot.category === 'campground' && spot.reservable && (
                    <RowPill variant="ghost">Reservable</RowPill>
                  )}
                  {spot.category === 'friend' && spot.sharedBy && (
                    <RowPill variant="sage">Shared</RowPill>
                  )}
                </div>
              </div>

              {/* Rating column — star + mono score */}
              {spot.category === 'derived' && spot.score !== undefined ? (
                <div className="flex items-center gap-1 mt-0.5 flex-shrink-0">
                  <Star className="w-3 h-3 text-clay" weight="fill" />
                  <span className="text-[11px] font-mono font-bold tracking-[0.02em] text-ink">{spot.score}</span>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {unifiedSpotList.length > 30 && (
        <div className="px-4 py-3 border-t border-line flex items-center justify-between">
          <Mono className="text-ink-3">
            {Math.min(spotsToShow, unifiedSpotList.length)} / {unifiedSpotList.length}
          </Mono>
          <div className="flex items-center gap-3">
            {spotsToShow < unifiedSpotList.length && (
              <button
                onClick={onShowMore}
                className="text-[11px] font-mono uppercase tracking-[0.10em] font-semibold text-pine-6 hover:text-pine-5 transition-colors"
              >
                Show more
              </button>
            )}
            {spotsToShow > 30 && (
              <button
                onClick={onShowLess}
                className="text-[11px] font-mono uppercase tracking-[0.10em] font-semibold text-ink-3 hover:text-ink transition-colors"
              >
                Show less
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};

// Row tag pill — matches the design's small Pill: 10px font, 5px/10px padding,
// pill shape, mono caps. Variants follow the design's accent/ghost/clay set.
const RowPill = ({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: 'accent' | 'ghost' | 'clay' | 'sage';
}) => {
  const styles =
    variant === 'accent' ? 'bg-pine-6/[0.18] border-pine-6 text-pine-6' :
    variant === 'clay'   ? 'bg-clay/[0.14]  border-clay   text-clay' :
    variant === 'sage'   ? 'bg-sage/[0.18]  border-sage   text-sage' :
                           'bg-white dark:bg-paper border-line dark:border-line-2 text-ink';
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full border text-[10px] font-mono font-semibold uppercase tracking-[0.12em]',
      styles,
    )}>
      {children}
    </span>
  );
};
