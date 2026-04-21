import { Link } from 'react-router-dom';
import { Boot, Calendar, Clock, Gauge, NavigationArrow, Path, PencilSimple } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { PhotoWeatherCard } from '@/components/PhotoWeatherCard';
import { DayCard } from '@/components/trip-detail/DayCard';
import { GeneratedTrip, TripConfig, TripStop } from '@/types/trip';
import { PhotoWeatherForecast } from '@/types/weather';
import { estimateDayTime } from '@/utils/tripValidation';

interface ItineraryPanelProps {
  tripConfig: TripConfig;
  generatedTrip: GeneratedTrip;
  expandedDays: number[];
  activeDay: number | null;
  selectedStop: TripStop | null;
  selectedStopWeather: PhotoWeatherForecast | null;
  loadingStopWeather: boolean;
  stopWeatherError: string | null;
  onOpenDateEdit: () => void;
  onToggleDay: (dayNumber: number) => void;
  onStartDay: (dayNumber: number) => void;
  onExitDay: () => void;
  onStopClick: (stop: TripStop | null) => void;
  onSwapHike: (stop: TripStop) => void;
  onSwapCampsite: (stop: TripStop) => void;
  onRemoveStop: (dayNumber: number, stop: TripStop) => void;
  onStartNavigation: () => void;
}

export const ItineraryPanel = ({
  tripConfig,
  generatedTrip,
  expandedDays,
  activeDay,
  selectedStop,
  selectedStopWeather,
  loadingStopWeather,
  stopWeatherError,
  onOpenDateEdit,
  onToggleDay,
  onStartDay,
  onExitDay,
  onStopClick,
  onSwapHike,
  onSwapCampsite,
  onRemoveStop,
  onStartNavigation,
}: ItineraryPanelProps) => {
  return (
    <div className="order-1 lg:order-2 space-y-4 lg:h-[calc(100vh-120px)] lg:overflow-y-auto">
      {/* Trip Header */}
      <div className="bg-muted/40 border-b px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 space-y-2 sm:space-y-3">
        <div>
          <h1 className="text-xl sm:text-3xl font-display font-bold text-foreground">
            {tripConfig.name || 'My Trip'}
          </h1>
          {tripConfig.startDate ? (
            <button
              onClick={onOpenDateEdit}
              className="flex items-center gap-2 mt-1 text-sm group hover:bg-secondary/50 rounded-lg px-2 py-1 -mx-2 transition-colors"
            >
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground">
                {new Date(tripConfig.startDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
                {' – '}
                {(() => {
                  const startDate = new Date(tripConfig.startDate!);
                  const endDate = new Date(startDate);
                  endDate.setDate(startDate.getDate() + generatedTrip.days.length - 1);
                  return endDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                })()}
              </span>
              <PencilSimple className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ) : (
            <button
              onClick={onOpenDateEdit}
              className="flex items-center gap-2 mt-1 text-sm text-primary hover:underline"
            >
              <Calendar className="w-4 h-4" />
              <span>Add trip dates</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground">
          <span className="flex items-center gap-1 sm:gap-1.5">
            <Path className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-terracotta" />
            {generatedTrip.totalDistance}
          </span>
          <span className="flex items-center gap-1 sm:gap-1.5">
            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            {generatedTrip.totalDrivingTime}
          </span>
          <span className="flex items-center gap-1 sm:gap-1.5">
            <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
            {generatedTrip.days.length} days
          </span>
          <span className="hidden sm:flex items-center gap-1.5 capitalize">
            <Gauge className="w-3.5 h-3.5" />
            {tripConfig.pacePreference || 'Moderate'}
          </span>
          {(() => {
            let totalHikingMinutes = 0;
            let hikeCount = 0;
            generatedTrip.days.forEach(day => {
              const estimate = estimateDayTime(day);
              totalHikingMinutes += estimate.hikingHours * 60;
              hikeCount += day.stops.filter(s => s.type === 'hike').length;
            });
            const hikingHours = Math.floor(totalHikingMinutes / 60);
            const hikingMiles = Math.round((totalHikingMinutes / 60) * 1.8);
            if (hikeCount === 0) return null;
            return (
              <span className="flex items-center gap-1.5">
                <Boot className="w-3.5 h-3.5 text-pinesoft" />
                {hikeCount} {hikeCount === 1 ? 'hike' : 'hikes'} • ~{hikingHours}h • ~{hikingMiles} mi
              </span>
            );
          })()}
        </div>
      </div>

      <div className="px-4 sm:px-6 space-y-4">
        {/* Photography Conditions - shows when a stop is selected */}
        {selectedStop && (
          <PhotoWeatherCard
            forecast={selectedStopWeather}
            loading={loadingStopWeather}
            error={stopWeatherError}
            locationName={selectedStop.name}
          />
        )}

        {/* Day-by-Day Itinerary */}
        <div className="space-y-3">
          <h2 className="text-lg font-display font-semibold text-foreground">Itinerary</h2>

          {generatedTrip.days.map((day) => (
            <DayCard
              key={day.day}
              day={day}
              tripName={tripConfig.name}
              tripStartDate={tripConfig.startDate}
              expanded={expandedDays.includes(day.day)}
              isActive={activeDay === day.day}
              isFirstDay={day.day === 1}
              isLastDay={day.day === generatedTrip.days.length}
              startLocation={tripConfig.startLocation}
              returnToStart={tripConfig.returnToStart}
              onToggle={() => onToggleDay(day.day)}
              onStartDay={() => onStartDay(day.day)}
              onExitDay={onExitDay}
              onStopClick={onStopClick}
              onSwapHike={onSwapHike}
              onSwapCampsite={onSwapCampsite}
              onRemoveStop={onRemoveStop}
            />
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4 pb-4 sm:pb-0">
          <Button variant="primary" size="lg" className="flex-1" onClick={onStartNavigation}>
            <NavigationArrow className="w-4 h-4 mr-2" />
            Start Trip
          </Button>
          <Link to="/create-trip" className="sm:w-auto">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              Edit Trip
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};
