import { CaretRight, PencilSimple, Plus, Flag, MapPin } from '@phosphor-icons/react';
import { TripConfig } from '@/types/trip';
import { cn } from '@/lib/utils';

interface TripTimelineStripProps {
  tripConfig: TripConfig;
  onEditStart: () => void;
  onEditDestination: (index: number, currentName: string, isEndLocation: boolean) => void;
  onEditEnd: () => void;
  onAddDestination: () => void;
}

// All chips render at exactly the same height/padding so the row reads as a
// rhythm of equal-sized pills connected by carets. Hover swaps in a hover
// surface without changing layout.
const CHIP_BASE = 'inline-flex items-center gap-1.5 h-7 px-3 rounded-full whitespace-nowrap text-[13px] font-sans font-semibold tracking-[-0.005em]';

export const TripTimelineStrip = ({
  tripConfig,
  onEditStart,
  onEditDestination,
  onEditEnd,
  onAddDestination,
}: TripTimelineStripProps) => {
  if (!tripConfig.startLocation && !tripConfig.baseLocation) return null;

  return (
    <div className="bg-cream border-b border-line">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {/* Start */}
          {tripConfig.startLocation && (
            <>
              <Stop
                accent="water"
                label={tripConfig.startLocation.name.split(',')[0]}
                onClick={onEditStart}
              />
              {tripConfig.destinations.length > 0 && <Connector />}
            </>
          )}

          {/* Base location mode (single-area trips) */}
          {tripConfig.baseLocation && !tripConfig.startLocation && (
            <span className={cn(CHIP_BASE, 'bg-pine-6/10 border border-pine-6/30 text-pine-6')}>
              <MapPin className="w-3 h-3" weight="fill" />
              Exploring {tripConfig.baseLocation.name.split(',')[0]}
            </span>
          )}

          {/* Destinations */}
          {tripConfig.destinations.map((dest, index) => {
            const isLast = index === tripConfig.destinations.length - 1;
            const isEnd = isLast && !tripConfig.returnToStart;
            return (
              <div key={dest.id} className="flex items-center gap-2 flex-shrink-0">
                <Stop
                  accent={isEnd ? 'ember' : 'pine'}
                  label={dest.name.split(',')[0]}
                  onClick={() => onEditDestination(index, dest.name, isEnd)}
                />
                {!isEnd && <Connector />}
              </div>
            );
          })}

          {/* Add destination */}
          {(tripConfig.returnToStart || tripConfig.destinations.length === 0) && (
            <>
              <button
                onClick={onAddDestination}
                className={cn(
                  CHIP_BASE,
                  'border border-dashed border-line text-ink-3 hover:text-pine-6 hover:border-pine-6 transition-colors group flex-shrink-0',
                )}
              >
                <Plus className="w-3 h-3 transition-transform group-hover:rotate-90" weight="bold" />
                Add stop
              </button>
              {tripConfig.returnToStart && <Connector />}
            </>
          )}

          {/* Round-trip end */}
          {tripConfig.returnToStart && tripConfig.startLocation && (
            <Stop
              accent="water"
              label={tripConfig.startLocation.name.split(',')[0]}
              onClick={onEditEnd}
              icon={Flag}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// Single editable stop chip — same height/padding for every variant. Accent
// encodes role (water = endpoints, pine = mid stops, ember = one-way end).
const Stop = ({
  accent,
  label,
  onClick,
  icon: Icon,
}: {
  accent: 'water' | 'pine' | 'ember';
  label: string;
  onClick: () => void;
  icon?: typeof Flag;
}) => {
  const dotClass =
    accent === 'water' ? 'bg-water' : accent === 'ember' ? 'bg-ember' : 'bg-pine-6';
  const iconColor =
    accent === 'water' ? 'text-water' : accent === 'ember' ? 'text-ember' : 'text-pine-6';
  return (
    <button
      onClick={onClick}
      className={cn(
        CHIP_BASE,
        'group flex-shrink-0 text-ink hover:bg-white transition-colors',
      )}
    >
      {Icon ? (
        <Icon className={cn('w-3 h-3', iconColor)} weight="regular" />
      ) : (
        <span className={cn('w-2 h-2 rounded-full', dotClass)} />
      )}
      {label}
      <PencilSimple
        className="w-3 h-3 text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity"
        weight="regular"
      />
    </button>
  );
};

const Connector = () => (
  <CaretRight className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" weight="bold" />
);
