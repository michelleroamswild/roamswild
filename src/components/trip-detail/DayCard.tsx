import { Link } from 'react-router-dom';
import {
  ArrowsClockwise,
  ArrowSquareOut,
  Boot,
  Camera,
  CaretDown,
  CaretUp,
  CaretRight,
  Clock,
  GasPump,
  MapPin,
  MapPinArea,
  Mountains,
  NavigationArrow,
  Path,
  Star,
  Tent,
  Trash,
  Warning,
} from '@phosphor-icons/react';
import { TripDay, TripStop } from '@/types/trip';
import { estimateDayTime } from '@/utils/tripValidation';
import { getAllTrailsUrl, estimateTrailLength } from '@/utils/hikeUtils';
import { getDayUrl } from '@/utils/slugify';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

// Icon + accent color per stop type. ALL stop / endpoint / warning icons use
// the exact same container shape: w-9 h-9 rounded-[10px] with a 15% accent
// fill. Only the accent hue varies. This rule is enforced by `IconBlock`
// below — don't render bespoke icon containers in this file.
const TYPE_STYLES: Record<string, { Icon: typeof MapPin; bg: string; text: string }> = {
  hike:     { Icon: Boot,       bg: 'bg-sage/15',   text: 'text-sage' },
  camp:     { Icon: Tent,       bg: 'bg-clay/15',   text: 'text-clay' },
  photo:    { Icon: Camera,     bg: 'bg-ember/15',  text: 'text-ember' },
  gas:      { Icon: GasPump,    bg: 'bg-ink/10',    text: 'text-ink-2' },
  start:    { Icon: MapPin,     bg: 'bg-pine-6/15', text: 'text-pine-6' },
  end:      { Icon: MapPin,     bg: 'bg-pine-6/15', text: 'text-pine-6' },
  default:  { Icon: MapPinArea, bg: 'bg-pine-6/15', text: 'text-pine-6' },
};

const styleFor = (type: string) => TYPE_STYLES[type] ?? TYPE_STYLES.default;

// Single source of truth for stop/endpoint/warning icon containers in the
// DayCard. Always w-9 h-9, rounded-[10px], tinted bg + saturated icon.
const IconBlock = ({
  Icon,
  bg,
  text,
  weight = 'regular',
}: {
  Icon: typeof MapPin;
  bg: string;
  text: string;
  weight?: 'regular' | 'fill';
}) => (
  <div className={cn('inline-flex items-center justify-center w-9 h-9 rounded-[10px] flex-shrink-0', bg, text)}>
    <Icon className="w-4 h-4" weight={weight} />
  </div>
);

export interface DayCardProps {
  day: TripDay;
  tripName?: string;
  tripStartDate?: string;
  expanded: boolean;
  isActive: boolean;
  isFirstDay: boolean;
  isLastDay: boolean;
  startLocation?: { name: string; coordinates: { lat: number; lng: number } };
  returnToStart?: boolean;
  onToggle: () => void;
  onStartDay: () => void;
  onExitDay: () => void;
  onStopClick: (stop: TripStop) => void;
  onSwapHike: (hike: TripStop) => void;
  onSwapCampsite: (campsite: TripStop) => void;
  onRemoveStop: (dayNumber: number, stop: TripStop) => void;
}

export const DayCard = ({
  day,
  tripName,
  tripStartDate,
  expanded,
  isActive,
  isFirstDay,
  isLastDay,
  startLocation,
  returnToStart,
  onToggle,
  onStartDay,
  onExitDay,
  onStopClick,
  onSwapHike,
  onSwapCampsite,
  onRemoveStop,
}: DayCardProps) => {
  const timeEstimate = estimateDayTime(day);

  const dayDate = tripStartDate
    ? (() => {
        const [year, month, dayNum] = tripStartDate.split('-').map(Number);
        const date = new Date(year, month - 1, dayNum + day.day - 1);
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      })()
    : null;

  return (
    <div
      className={cn(
        'border bg-white rounded-[14px] overflow-hidden transition-colors',
        isActive ? 'border-pine-6 ring-1 ring-pine-6' : 'border-line',
      )}
    >
      {/* Day header — click to expand */}
      <div className="hover:bg-cream/40 transition-colors">
        <div className="flex items-center justify-between p-3 sm:p-4 gap-2">
          <button
            onClick={onToggle}
            className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 text-left"
          >
            <div
              className={cn(
                'inline-flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 rounded-full shrink-0 font-mono font-bold text-[13px] sm:text-[15px] tracking-[0.02em]',
                isActive ? 'bg-pine-6 text-cream' : 'bg-pine-6/10 text-pine-6',
              )}
            >
              {day.day}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-sans font-semibold text-ink text-[14px] sm:text-[15px] tracking-[-0.005em]">
                  Day {day.day}
                </p>
                {dayDate && (
                  <Mono className="text-ink-3" size={11}>
                    {dayDate}
                  </Mono>
                )}
                {isActive && <Mono className="text-pine-6">Previewing</Mono>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
                <span className="inline-flex items-center gap-1.5">
                  <Path className="w-3 h-3" weight="regular" />
                  {day.drivingDistance}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3 h-3" weight="regular" />
                  {day.drivingTime}
                </span>
                {day.hike && (
                  <span className="inline-flex items-center gap-1 text-sage">
                    <Boot className="w-3 h-3" weight="regular" />
                    Hike
                  </span>
                )}
                {day.campsite && (
                  <span className="inline-flex items-center gap-1 text-clay">
                    <Tent className="w-3 h-3" weight="regular" />
                    Camp
                  </span>
                )}
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {timeEstimate.warningMessage && (
              <span
                title={timeEstimate.warningMessage}
                className={cn(
                  'hidden sm:inline-flex items-center justify-center w-7 h-7 rounded-full',
                  timeEstimate.isOverloaded ? 'text-clay' : 'text-water',
                )}
              >
                <Warning className="w-4 h-4" weight="regular" />
              </span>
            )}

            <Pill
              variant={isActive ? 'solid-pine' : 'ghost'}
              sm
              mono={false}
              onClick={() => (isActive ? onExitDay() : onStartDay())}
            >
              <NavigationArrow className="w-3 h-3" weight="regular" />
              <span className="hidden sm:inline">{isActive ? 'Exit' : 'Preview'}</span>
            </Pill>

            <button
              onClick={onToggle}
              aria-label={expanded ? 'Collapse day' : 'Expand day'}
              className="inline-flex items-center justify-center w-7 h-7 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors"
            >
              {expanded ? (
                <CaretUp className="w-4 h-4" weight="bold" />
              ) : (
                <CaretDown className="w-4 h-4" weight="bold" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Stops */}
      {expanded && (
        <div className="border-t border-line">
          {/* Day-1 starting location chip */}
          {isFirstDay && startLocation && (
            <Endpoint label={`Start: ${startLocation.name}`} sub="Trip starting point" />
          )}

          {day.stops.map((stop) => {
            // Special "no dispersed sites found" placeholder — same icon
            // container treatment as everything else (just clay accent).
            if (stop.id === 'no-dispersed-found' || stop.note === 'NO_DISPERSED_SITES_FOUND') {
              return (
                <div
                  key={stop.id}
                  className="p-4 hover:bg-cream/40 transition-colors border-b border-line last:border-b-0"
                >
                  <div className="flex items-start gap-3">
                    <IconBlock Icon={Warning} bg="bg-clay/15" text="text-clay" />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-[14px] font-sans font-semibold text-ink">
                        No dispersed campsites found
                      </h4>
                      <p className="text-[13px] text-ink-3 mt-0.5 leading-[1.5]">
                        There are no known dispersed camping spots in this area.
                      </p>
                      <div className="mt-3">
                        <Pill variant="ghost" sm mono={false} onClick={() => onSwapCampsite(stop)} className="!border-clay !text-clay hover:!bg-clay/10">
                          <Tent className="w-3.5 h-3.5" weight="regular" />
                          Search established campgrounds instead
                        </Pill>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            const { Icon, bg, text } = styleFor(stop.type);
            return (
              <div
                key={stop.id}
                className="p-4 hover:bg-cream/40 transition-colors border-b border-line last:border-b-0 group"
              >
                <div className="flex items-start gap-3">
                  <IconBlock Icon={Icon} bg={bg} text={text} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onStopClick(stop)}
                        className="text-left flex-1 min-w-0"
                      >
                        <h4 className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">
                          {stop.name}
                        </h4>
                        <p className="text-[13px] text-ink-3 mt-0.5 leading-[1.5]">
                          {stop.description}
                        </p>
                      </button>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {stop.type === 'hike' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onSwapHike(stop); }}
                            title="Swap hike"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sage hover:bg-sage/15 transition-colors"
                          >
                            <ArrowsClockwise className="w-3.5 h-3.5" weight="bold" />
                          </button>
                        )}
                        {stop.type === 'camp' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onSwapCampsite(stop); }}
                            title="Swap campsite"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-clay hover:bg-clay/15 transition-colors"
                          >
                            <ArrowsClockwise className="w-3.5 h-3.5" weight="bold" />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); onRemoveStop(day.day, stop); }}
                          title="Remove stop"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full text-ink-3 hover:text-ember hover:bg-ember/10 transition-colors"
                        >
                          <Trash className="w-3.5 h-3.5" weight="regular" />
                        </button>
                      </div>
                    </div>

                    {/* Meta line — mono caps */}
                    <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" weight="regular" />
                        {stop.duration}
                      </span>
                      {stop.type === 'hike' && estimateTrailLength(stop.duration) && (
                        <span className="inline-flex items-center gap-1">
                          <Mountains className="w-3 h-3" weight="regular" />
                          {estimateTrailLength(stop.duration)}
                        </span>
                      )}
                      {stop.distance && (
                        <span className="inline-flex items-center gap-1">
                          <Path className="w-3 h-3" weight="regular" />
                          {stop.distance}
                        </span>
                      )}
                      {stop.drivingTime && (
                        <span className="inline-flex items-center gap-1 text-pine-6">
                          <NavigationArrow className="w-3 h-3" weight="regular" />
                          {stop.drivingTime}
                        </span>
                      )}
                      {stop.rating && (
                        <span className="inline-flex items-center gap-1">
                          <Star className="w-3 h-3 fill-clay text-clay" weight="fill" />
                          {stop.rating.toFixed(1)}
                        </span>
                      )}
                      {stop.type === 'hike' && (
                        <a
                          href={getAllTrailsUrl(stop.name, stop.coordinates.lat, stop.coordinates.lng)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-sage hover:text-sage/80 transition-colors"
                        >
                          <ArrowSquareOut className="w-3 h-3" weight="regular" />
                          AllTrails
                        </a>
                      )}
                      {stop.type === 'camp' && stop.bookingUrl && (
                        <a
                          href={stop.bookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-clay hover:text-clay/80 transition-colors"
                        >
                          <ArrowSquareOut className="w-3 h-3" weight="regular" />
                          Book site
                        </a>
                      )}
                      {stop.type === 'camp' && (
                        <span className="inline-flex items-center gap-1.5 text-ink-3">
                          {stop.id.startsWith('ridb-') ? (
                            <a
                              href={`https://www.recreation.gov/camping/campgrounds/${stop.id.replace('ridb-', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-pine-6 transition-colors"
                            >
                              Recreation.gov
                            </a>
                          ) : stop.id.startsWith('usfs-') ? (
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(stop.name + ' USFS campground')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-pine-6 transition-colors"
                            >
                              USFS
                            </a>
                          ) : stop.id.startsWith('osm-') ? (
                            <a
                              href={`https://www.openstreetmap.org/${stop.id.replace('osm-', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-pine-6 transition-colors"
                            >
                              OpenStreetMap
                            </a>
                          ) : stop.placeId ? (
                            <a
                              href={`https://www.google.com/maps/place/?q=place_id:${stop.placeId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-pine-6 transition-colors"
                            >
                              Google Maps
                            </a>
                          ) : (
                            'source unknown'
                          )}
                          <span className="opacity-70">
                            ({stop.coordinates.lat.toFixed(4)}, {stop.coordinates.lng.toFixed(4)})
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Last-day return-to-start chip */}
          {isLastDay && returnToStart && startLocation && (
            <Endpoint label={`End: ${startLocation.name}`} sub="Return to starting point" />
          )}

          {/* View Day Details link */}
          <Link
            to={getDayUrl(tripName, day.day)}
            className="flex items-center justify-center gap-1.5 px-4 py-3 text-[12px] font-mono uppercase tracking-[0.10em] font-semibold text-pine-6 hover:bg-pine-6/5 transition-colors"
          >
            View day details
            <CaretRight className="w-3 h-3" weight="bold" />
          </Link>
        </div>
      )}
    </div>
  );
};

// Endpoint chip — same row container + IconBlock as stops, pine-tinted to
// match the "start/end" type style (water was too light for icon contrast).
const Endpoint = ({ label, sub }: { label: string; sub: string }) => (
  <div className="p-4 border-b border-line">
    <div className="flex items-start gap-3">
      <IconBlock Icon={MapPin} bg="bg-pine-6/15" text="text-pine-6" />
      <div className="flex-1 min-w-0">
        <h4 className="text-[14px] font-sans font-semibold text-ink">{label}</h4>
        <p className="text-[13px] text-ink-3 mt-0.5">{sub}</p>
      </div>
    </div>
  </div>
);
