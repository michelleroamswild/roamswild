import { Link } from 'react-router-dom';
import {
  ArrowsClockwise,
  ArrowSquareOut,
  Boot,
  Camera,
  CaretDown,
  CaretUp,
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
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TripDay, TripStop } from '@/types/trip';
import { estimateDayTime } from '@/utils/tripValidation';
import { getAllTrailsUrl, estimateTrailLength } from '@/utils/hikeUtils';
import { getTypeStyles } from '@/utils/mapMarkers';
import { getDayUrl } from '@/utils/slugify';

const getIcon = (type: string) => {
  switch (type) {
    case 'hike':
      return Boot;
    case 'gas':
      return GasPump;
    case 'camp':
      return Tent;
    case 'photo':
      return Camera;
    case 'start':
    case 'end':
      return MapPin;
    default:
      return MapPinArea;
  }
};

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

  const dayDate = tripStartDate ? (() => {
    const [year, month, dayNum] = tripStartDate.split('-').map(Number);
    const date = new Date(year, month - 1, dayNum + day.day - 1);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  })() : null;

  return (
    <Card className={`overflow-hidden ${isActive ? 'ring-2 ring-primary border-primary' : ''}`}>
      {/* Day Header */}
      <div className="p-3 sm:p-4 hover:bg-secondary/50 transition-colors">
        <div className="flex items-center justify-between">
          <button
            onClick={onToggle}
            className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0"
          >
            <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full shrink-0 ${isActive ? 'bg-primary text-primary-foreground' : 'bg-primary/10'}`}>
              <span className={`text-sm sm:text-lg font-bold ${isActive ? '' : 'text-primary'}`}>{day.day}</span>
            </div>
            <div className="text-left min-w-0">
              <p className="font-medium text-foreground text-sm sm:text-base truncate">
                Day {day.day}
                {dayDate && <span className="ml-1.5 sm:ml-2 text-xs sm:text-sm font-normal text-muted-foreground">{dayDate}</span>}
                {isActive && <span className="ml-1.5 text-[10px] sm:text-xs text-primary font-normal">(Previewing)</span>}
              </p>
              <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Path className="w-3 h-3" />
                  {day.drivingDistance}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {day.drivingTime}
                </span>
              </div>
            </div>
          </button>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {timeEstimate.warningMessage && (
              <Warning
                className={`w-4 h-4 hidden sm:block ${timeEstimate.isOverloaded ? 'text-amber-500' : 'text-blue-500'}`}
                title={timeEstimate.warningMessage}
              />
            )}
            <div className="hidden sm:flex items-center gap-1">
              {day.hike && <Boot className="w-4 h-4 text-pinesoft" />}
              {day.campsite && <Tent className="w-4 h-4 text-wildviolet" />}
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="text-xs sm:text-sm h-7 w-7 sm:w-auto sm:h-8 px-0 sm:px-3"
              onClick={(e) => {
                e.stopPropagation();
                if (isActive) {
                  onExitDay();
                } else {
                  onStartDay();
                }
              }}
            >
              <NavigationArrow className="w-3 h-3 sm:mr-1" />
              <span className="hidden sm:inline">{isActive ? 'Exit Preview' : 'Preview'}</span>
            </Button>
            <button onClick={onToggle}>
              {expanded ? (
                <CaretUp className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
              ) : (
                <CaretDown className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Day Stops */}
      {expanded && (
        <div className="border-t border-border">
          {/* Starting location on day 1 */}
          {isFirstDay && startLocation && (
            <div className="p-4 bg-aquateal/5 border-b border-border">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg border border-aquateal/30 bg-aquateal/20">
                  <MapPin className="w-4 h-4 text-aquateal" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-foreground">Start: {startLocation.name}</h4>
                  <p className="text-sm text-muted-foreground mt-0.5">Trip starting point</p>
                </div>
              </div>
            </div>
          )}

          {day.stops.map((stop) => {
            const Icon = getIcon(stop.type);
            const typeStyles = getTypeStyles(stop.type);

            // Special handling for "no dispersed sites found" marker
            if (stop.id === 'no-dispersed-found' || stop.note === 'NO_DISPERSED_SITES_FOUND') {
              return (
                <div
                  key={stop.id}
                  className="p-4 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-100 dark:bg-amber-800/30">
                      <Warning className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-amber-800 dark:text-amber-200">No dispersed campsites found</h4>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
                        There are no known dispersed camping spots in this area.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-800/30"
                        onClick={() => onSwapCampsite(stop)}
                      >
                        <Tent className="w-4 h-4 mr-2" />
                        Search for established campgrounds instead
                      </Button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={stop.id}
                className="p-4 hover:bg-secondary/30 transition-colors border-b border-border last:border-b-0 group"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex items-center justify-center w-9 h-9 rounded-lg border ${typeStyles}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="cursor-pointer flex-1"
                        onClick={() => onStopClick(stop)}
                      >
                        <h4 className="font-medium text-foreground">{stop.name}</h4>
                        <p className="text-sm text-muted-foreground mt-0.5">{stop.description}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {stop.type === 'hike' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSwapHike(stop);
                            }}
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors"
                            title="Choose different hike"
                          >
                            <ArrowsClockwise className="w-4 h-4" weight="bold" />
                          </button>
                        )}
                        {stop.type === 'camp' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSwapCampsite(stop);
                            }}
                            className="p-1.5 rounded-lg hover:bg-wildviolet/10 text-wildviolet transition-colors"
                            title="Choose different campsite"
                          >
                            <ArrowsClockwise className="w-4 h-4" weight="bold" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveStop(day.day, stop);
                          }}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                          title="Remove stop"
                        >
                          <Trash className="w-4 h-4" weight="bold" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {stop.duration}
                      </span>
                      {stop.type === 'hike' && estimateTrailLength(stop.duration) && (
                        <span className="flex items-center gap-1">
                          <Mountains className="w-3 h-3" />
                          {estimateTrailLength(stop.duration)}
                        </span>
                      )}
                      {stop.distance && (
                        <span className="flex items-center gap-1">
                          <Path className="w-3 h-3" />
                          {stop.distance}
                        </span>
                      )}
                      {stop.drivingTime && (
                        <span className="flex items-center gap-1 text-primary">
                          <NavigationArrow className="w-3 h-3" />
                          {stop.drivingTime}
                        </span>
                      )}
                      {stop.rating && (
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {stop.rating.toFixed(1)}
                        </span>
                      )}
                      {stop.type === 'hike' && (
                        <a
                          href={getAllTrailsUrl(stop.name, stop.coordinates.lat, stop.coordinates.lng)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 hover:underline"
                        >
                          <ArrowSquareOut className="w-3 h-3" />
                          AllTrails
                        </a>
                      )}
                      {stop.type === 'camp' && stop.bookingUrl && (
                        <a
                          href={stop.bookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-wildviolet hover:text-wildviolet/80 hover:underline"
                        >
                          <ArrowSquareOut className="w-3 h-3" />
                          Book Site
                        </a>
                      )}
                      {stop.type === 'camp' && (
                        <span className="flex items-center gap-1 text-muted-foreground/70">
                          {stop.id.startsWith('ridb-') ? (
                            <a
                              href={`https://www.recreation.gov/camping/campgrounds/${stop.id.replace('ridb-', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-primary hover:underline"
                            >
                              Recreation.gov
                            </a>
                          ) : stop.id.startsWith('usfs-') ? (
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(stop.name + ' USFS campground')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-primary hover:underline"
                            >
                              USFS
                            </a>
                          ) : stop.id.startsWith('osm-') ? (
                            <a
                              href={`https://www.openstreetmap.org/${stop.id.replace('osm-', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-primary hover:underline"
                            >
                              OpenStreetMap
                            </a>
                          ) : stop.placeId ? (
                            <a
                              href={`https://www.google.com/maps/place/?q=place_id:${stop.placeId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-primary hover:underline"
                            >
                              Google Maps
                            </a>
                          ) : 'source unknown'}
                          <span className="text-[10px] opacity-70">
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

          {/* Ending location on last day if returning to start */}
          {isLastDay && returnToStart && startLocation && (
            <div className="p-4 bg-aquateal/5 border-b border-border">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg border border-aquateal/30 bg-aquateal/20">
                  <MapPin className="w-4 h-4 text-aquateal" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-foreground">End: {startLocation.name}</h4>
                  <p className="text-sm text-muted-foreground mt-0.5">Return to starting point</p>
                </div>
              </div>
            </div>
          )}

          {/* View Day Details Link */}
          <Link
            to={getDayUrl(tripName, day.day)}
            className="block p-3 text-center text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
          >
            View Day Details →
          </Link>
        </div>
      )}
    </Card>
  );
};
