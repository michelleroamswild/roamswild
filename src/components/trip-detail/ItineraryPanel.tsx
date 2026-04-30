import { Link } from 'react-router-dom';
import {
  Boot,
  Calendar,
  Clock,
  Gauge,
  NavigationArrow,
  Path,
  PencilSimple,
  PencilSimpleLine,
} from '@phosphor-icons/react';
import { DayCard } from '@/components/trip-detail/DayCard';
import { GeneratedTrip, TripConfig, TripStop } from '@/types/trip';
import { PhotoWeatherForecast } from '@/types/weather';
import { estimateDayTime } from '@/utils/tripValidation';
import { Mono, Pill } from '@/components/redesign';

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
  // Roll up hike count + estimated total time/miles for the meta line.
  let totalHikingMinutes = 0;
  let hikeCount = 0;
  generatedTrip.days.forEach((day) => {
    const est = estimateDayTime(day);
    totalHikingMinutes += est.hikingHours * 60;
    hikeCount += day.stops.filter((s) => s.type === 'hike').length;
  });
  const hikingHours = Math.floor(totalHikingMinutes / 60);
  const hikingMiles = Math.round((totalHikingMinutes / 60) * 1.8);

  // Format the trip date range when start date is set.
  const dateRange = (() => {
    if (!tripConfig.startDate) return null;
    const start = new Date(tripConfig.startDate);
    const end = new Date(start);
    end.setDate(start.getDate() + generatedTrip.days.length - 1);
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const sameMonth = start.getMonth() === end.getMonth();
    return sameMonth ? `${fmt(start)} – ${end.getDate()}` : `${fmt(start)} – ${fmt(end)}`;
  })();

  return (
    <div className="order-1 lg:order-2 bg-paper lg:h-[calc(100vh-120px)] lg:overflow-y-auto">
      <div className="px-4 sm:px-6 pt-5 pb-5 space-y-5">
        {/* Trip header — wrapped in a card on the paper sidebar so it reads
            as a contained intro section rather than a flat band. */}
        <div className="bg-white border border-line rounded-[14px] p-5">
          <Mono className="text-pine-6">Your trip</Mono>
          <h1 className="text-[24px] sm:text-[32px] font-sans font-bold tracking-[-0.025em] text-ink leading-[1.1] mt-1">
            {tripConfig.name || 'My trip'}
          </h1>

          {/* Date range — clickable to edit */}
          {dateRange ? (
            <button
              onClick={onOpenDateEdit}
              className="mt-2 inline-flex items-center gap-1.5 group text-[12px] font-mono uppercase tracking-[0.10em] text-ink-3 hover:text-ink transition-colors"
            >
              <Calendar className="w-3.5 h-3.5" weight="regular" />
              {dateRange}
              <PencilSimple className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" weight="regular" />
            </button>
          ) : (
            <button
              onClick={onOpenDateEdit}
              className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.10em] text-pine-6 hover:text-pine-5 transition-colors"
            >
              <PencilSimpleLine className="w-3.5 h-3.5" weight="regular" />
              Add trip dates
            </button>
          )}

          {/* Stat row — mono caps. All icons share the ink-3 color of the row
              so nothing stands out asymmetrically. */}
          <div className="mt-4 pt-4 border-t border-line flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <Path className="w-3.5 h-3.5" weight="regular" />
              {generatedTrip.totalDistance}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" weight="regular" />
              {generatedTrip.totalDrivingTime}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" weight="regular" />
              {generatedTrip.days.length} {generatedTrip.days.length === 1 ? 'day' : 'days'}
            </span>
            {tripConfig.pacePreference && (
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5" weight="regular" />
                {tripConfig.pacePreference} pace
              </span>
            )}
            {hikeCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Boot className="w-3.5 h-3.5" weight="regular" />
                {hikeCount} {hikeCount === 1 ? 'hike' : 'hikes'} · ~{hikingHours}h · ~{hikingMiles} mi
              </span>
            )}
          </div>
        </div>
        {/* Day-by-day itinerary */}
        <div className="space-y-3">
          <Mono className="text-ink-2">Itinerary</Mono>
          <div className="space-y-3">
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
        </div>

        {/* Action pills */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Pill
            variant="solid-pine"
            mono={false}
            onClick={onStartNavigation}
            className="!flex-1 !justify-center !py-3"
          >
            <NavigationArrow className="w-4 h-4" weight="regular" />
            Start trip
          </Pill>
          <Link to="/create-trip" className="sm:w-auto">
            <Pill variant="ghost" mono={false} className="!w-full !justify-center !py-3">
              Edit trip
            </Pill>
          </Link>
        </div>
      </div>
    </div>
  );
};
