import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Path,
  Clock,
  MapPin,
  MapPinArea,
  NavigationArrow,
  Star,
  Boot,
  Tent,
  GasPump,
  Trash,
  ArrowsClockwise,
  Plus,
  Warning,
  ArrowSquareOut,
  Mountains,
  Cloud,
  Sun,
  CloudRain,
  Snowflake,
  Wind,
  SpinnerGap,
  Camera,
} from '@phosphor-icons/react';
import { useTrip } from '@/context/TripContext';
import { GoogleMap } from '@/components/GoogleMap';
import { Marker, DirectionsRenderer } from '@react-google-maps/api';
import { TripStop } from '@/types/trip';
import { toast } from 'sonner';
import { AlternativeHikesModal } from '@/components/AlternativeHikesModal';
import { AlternativeCampsitesModal } from '@/components/AlternativeCampsitesModal';
import { AddStopModal } from '@/components/AddStopModal';
import { createMarkerIcon } from '@/utils/mapMarkers';
import { estimateDayTime } from '@/utils/tripValidation';
import { getAllTrailsUrl, estimateTrailLength } from '@/utils/hikeUtils';
import { getTripSlug, getTripUrl, getDayUrl } from '@/utils/slugify';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

// NOAA weather types — local to this page (not used elsewhere).
interface WeatherForecast {
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
}

const weatherCache = new Map<string, WeatherForecast>();

const getWeatherIcon = (forecast: string) => {
  const lower = forecast.toLowerCase();
  if (lower.includes('snow')) return Snowflake;
  if (lower.includes('rain') || lower.includes('shower')) return CloudRain;
  if (lower.includes('cloud') || lower.includes('overcast')) return Cloud;
  if (lower.includes('wind')) return Wind;
  return Sun;
};

async function fetchWeather(lat: number, lng: number): Promise<WeatherForecast | null> {
  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (weatherCache.has(cacheKey)) return weatherCache.get(cacheKey)!;

  try {
    const pointsResponse = await fetch(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`,
      { headers: { 'User-Agent': 'TripPlanner (contact@example.com)', Accept: 'application/geo+json' } }
    );
    if (!pointsResponse.ok) return null;
    const pointsData = await pointsResponse.json();
    const forecastUrl = pointsData.properties?.forecast;
    if (!forecastUrl) return null;

    const forecastResponse = await fetch(forecastUrl, {
      headers: { 'User-Agent': 'TripPlanner (contact@example.com)', Accept: 'application/geo+json' },
    });
    if (!forecastResponse.ok) return null;
    const forecastData = await forecastResponse.json();
    const periods = forecastData.properties?.periods;
    if (!periods || periods.length === 0) return null;

    const current = periods[0];
    const weather: WeatherForecast = {
      temperature: current.temperature,
      temperatureUnit: current.temperatureUnit,
      shortForecast: current.shortForecast,
    };
    weatherCache.set(cacheKey, weather);
    return weather;
  } catch (error) {
    console.error('Weather fetch error:', error);
    return null;
  }
}

// Per-stop-type icon + accent (matches DayCard in trip-detail).
const TYPE_STYLES: Record<string, { Icon: typeof MapPin; bg: string; text: string }> = {
  hike:      { Icon: Boot,       bg: 'bg-sage/15',   text: 'text-sage' },
  camp:      { Icon: Tent,       bg: 'bg-clay/15',   text: 'text-clay' },
  photo:     { Icon: Camera,     bg: 'bg-ember/15',  text: 'text-ember' },
  viewpoint: { Icon: MapPinArea, bg: 'bg-ember/15',  text: 'text-ember' },
  gas:       { Icon: GasPump,    bg: 'bg-ink/10',    text: 'text-ink-2' },
  start:     { Icon: MapPin,     bg: 'bg-pine-6/15', text: 'text-pine-6' },
  end:       { Icon: MapPin,     bg: 'bg-pine-6/15', text: 'text-pine-6' },
  default:   { Icon: MapPinArea, bg: 'bg-pine-6/15', text: 'text-pine-6' },
};
const styleFor = (type: string) => TYPE_STYLES[type] ?? TYPE_STYLES.default;

const IconBlock = ({ Icon, bg, text }: { Icon: typeof MapPin; bg: string; text: string }) => (
  <div className={cn('inline-flex items-center justify-center w-9 h-9 rounded-[10px] flex-shrink-0', bg, text)}>
    <Icon className="w-4 h-4" weight="regular" />
  </div>
);

const DayDetail = () => {
  const { slug, dayNumber } = useParams<{ slug: string; dayNumber: string }>();
  const navigate = useNavigate();
  const { generatedTrip, loadSavedTripBySlug, updateTripStop, removeTripStop, addTripStop } = useTrip();

  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [hikeModalOpen, setHikeModalOpen] = useState(false);
  const [selectedHikeForSwap, setSelectedHikeForSwap] = useState<TripStop | null>(null);
  const [campsiteModalOpen, setCampsiteModalOpen] = useState(false);
  const [selectedCampsiteForSwap, setSelectedCampsiteForSwap] = useState<TripStop | null>(null);
  const [addStopModalOpen, setAddStopModalOpen] = useState(false);
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [endLocationName, setEndLocationName] = useState<string | null>(null);

  const dayNum = parseInt(dayNumber || '1', 10);

  useEffect(() => {
    if (slug && (!generatedTrip || getTripSlug(generatedTrip.config.name) !== slug)) {
      const loaded = loadSavedTripBySlug(slug);
      if (!loaded) navigate('/trips');
    }
  }, [slug, generatedTrip, loadSavedTripBySlug, navigate]);

  const day = generatedTrip?.days.find((d) => d.day === dayNum);

  // Fetch directions for this day's route.
  useEffect(() => {
    if (!mapsLoaded || !generatedTrip || !day || day.stops.length === 0) return;

    const directionsService = new google.maps.DirectionsService();
    const startLocation = generatedTrip.config.startLocation?.coordinates;
    const baseLocation = generatedTrip.config.baseLocation?.coordinates;

    let dayOrigin: google.maps.LatLngLiteral;
    if (dayNum === 1) {
      dayOrigin = startLocation || baseLocation || day.stops[0].coordinates;
    } else {
      const prevDay = generatedTrip.days.find((d) => d.day === dayNum - 1);
      const prevCampsite = prevDay?.stops.find((s) => s.type === 'camp');
      dayOrigin = prevCampsite?.coordinates || day.stops[0].coordinates;
    }

    const dayCampsite = day.stops.find((s) => s.type === 'camp');
    const dayActivities = day.stops.filter(
      (s) => s.type === 'hike' || s.type === 'viewpoint' || s.type === 'photo'
    );
    const dayDestination =
      dayCampsite?.coordinates ||
      dayActivities[dayActivities.length - 1]?.coordinates ||
      day.stops[day.stops.length - 1]?.coordinates;
    if (!dayDestination) return;

    const waypoints = dayActivities.map((stop) => ({
      location: stop.coordinates,
      stopover: true,
    }));

    directionsService.route(
      {
        origin: dayOrigin,
        destination: dayDestination,
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) setDirections(result);
      }
    );
  }, [mapsLoaded, generatedTrip, day, dayNum]);

  // Weather for the day's main location.
  useEffect(() => {
    if (!day || day.stops.length === 0) return;
    const mainStop = day.stops.find((s) => s.type === 'hike' || s.type === 'viewpoint') || day.stops[0];
    if (!mainStop) return;

    setWeatherLoading(true);
    fetchWeather(mainStop.coordinates.lat, mainStop.coordinates.lng)
      .then((w) => setWeather(w))
      .finally(() => setWeatherLoading(false));
  }, [day]);

  // Reverse geocode end location for the header.
  useEffect(() => {
    if (!mapsLoaded || !generatedTrip || !day) return;
    const isLastDay = dayNum === generatedTrip.days.length;

    if (isLastDay && generatedTrip.config.returnToStart) {
      setEndLocationName(generatedTrip.config.startLocation?.name || 'Home');
      return;
    }

    const endStop = day.stops.find((s) => s.type === 'end');
    const campsite = day.stops.find((s) => s.type === 'camp');
    const finalStop = endStop || campsite;
    if (!finalStop) {
      setEndLocationName(null);
      return;
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: finalStop.coordinates }, (results, status) => {
      if (status === 'OK' && results && results.length > 0) {
        let city = '';
        let state = '';
        for (const result of results) {
          for (const component of result.address_components) {
            if (component.types.includes('locality')) city = component.long_name;
            if (component.types.includes('administrative_area_level_1')) state = component.short_name;
          }
          if (city && state) break;
        }
        if (city && state) setEndLocationName(`${city}, ${state}`);
        else if (city) setEndLocationName(city);
        else if (state) setEndLocationName(state);
        else setEndLocationName(finalStop.name);
      } else {
        setEndLocationName(finalStop.name);
      }
    });
  }, [mapsLoaded, generatedTrip, day, dayNum]);

  const handleOpenHikeSwap = (hike: TripStop) => {
    setSelectedHikeForSwap(hike);
    setHikeModalOpen(true);
  };

  const handleSwapHike = (newHike: TripStop) => {
    if (selectedHikeForSwap) {
      updateTripStop(selectedHikeForSwap.day, selectedHikeForSwap.id, newHike);
      toast.success('Hike updated', { description: `Changed to ${newHike.name}` });
    }
  };

  const handleOpenCampsiteSwap = (campsite: TripStop) => {
    setSelectedCampsiteForSwap(campsite);
    setCampsiteModalOpen(true);
  };

  const handleSwapCampsite = (newCampsite: TripStop) => {
    if (selectedCampsiteForSwap) {
      updateTripStop(selectedCampsiteForSwap.day, selectedCampsiteForSwap.id, newCampsite);
      toast.success('Campsite updated', { description: `Changed to ${newCampsite.name}` });
    }
  };

  const handleRemoveStop = (stop: TripStop) => {
    removeTripStop(dayNum, stop.id);
    toast.success('Stop removed', { description: `Removed ${stop.name}` });
  };

  const handleAddStop = (stop: TripStop) => {
    addTripStop(dayNum, stop);
    toast.success('Stop added', { description: `Added ${stop.name} to Day ${dayNum}` });
  };

  const handleNavigateDay = () => {
    if (!day || day.stops.length === 0) return;
    const stops = day.stops;
    const dest = `${stops[stops.length - 1].coordinates.lat},${stops[stops.length - 1].coordinates.lng}`;

    const buildNavUrl = (origin?: string) => {
      let waypoints: string;
      if (origin) {
        waypoints = stops.slice(0, -1).map((s) => `${s.coordinates.lat},${s.coordinates.lng}`).join('|');
      } else {
        waypoints = stops.slice(1, -1).map((s) => `${s.coordinates.lat},${s.coordinates.lng}`).join('|');
        origin = `${stops[0].coordinates.lat},${stops[0].coordinates.lng}`;
      }
      return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}`;
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const origin = `${position.coords.latitude},${position.coords.longitude}`;
          window.open(buildNavUrl(origin), '_blank');
        },
        () => window.open(buildNavUrl(), '_blank'),
        { timeout: 5000, maximumAge: 60000 }
      );
    } else {
      window.open(buildNavUrl(), '_blank');
    }
  };

  if (!generatedTrip || !day) return null;

  const mapCenter =
    day.stops.length > 0
      ? {
          lat: day.stops.reduce((sum, s) => sum + s.coordinates.lat, 0) / day.stops.length,
          lng: day.stops.reduce((sum, s) => sum + s.coordinates.lng, 0) / day.stops.length,
        }
      : { lat: 37.7749, lng: -122.4194 };

  const mainDestination = day.stops.find((s) => s.type === 'viewpoint') || day.stops[0];
  const destinationName = mainDestination?.name || `Day ${dayNum}`;

  const getDestinationForDay = (dayNumber: number): string => {
    if (generatedTrip.config.baseLocation) return generatedTrip.config.baseLocation.name;
    const destinations = generatedTrip.config.destinations;
    if (destinations.length === 0) return destinationName;
    let dayCount = 0;
    for (const dest of destinations) {
      const daysAtDest = dest.daysAtDestination || 1;
      dayCount += daysAtDest;
      if (dayNumber <= dayCount) return dest.name;
    }
    return destinations[destinations.length - 1]?.name || destinationName;
  };

  const getOriginName = (): string => {
    if (dayNum === 1) {
      return (
        generatedTrip.config.startLocation?.name ||
        generatedTrip.config.baseLocation?.name ||
        'your starting point'
      );
    }
    return getDestinationForDay(dayNum - 1);
  };

  const endName = endLocationName || getDestinationForDay(dayNum);
  const originName = getOriginName();

  const getDaySummary = (): string => {
    const isLastDay = dayNum === generatedTrip.days.length;
    const hasHike = day.stops.some((s) => s.type === 'hike');
    const hasCamp = day.stops.some((s) => s.type === 'camp');

    if (dayNum === 1) {
      if (hasHike && hasCamp)
        return `Starting your adventure from ${originName}. Explore ${destinationName}, hit the trails, and set up camp for the night.`;
      if (hasHike)
        return `Starting your adventure from ${originName}. Drive to ${destinationName} and enjoy a hike.`;
      return `Starting your drive from ${originName} to ${destinationName}.`;
    }
    if (isLastDay && generatedTrip.config.returnToStart) {
      return `Final day. Head back from ${originName} to ${generatedTrip.config.startLocation?.name || 'home'}.`;
    }
    if (hasHike && hasCamp)
      return `Continuing from ${originName}. Explore ${destinationName}, enjoy a hike, and set up camp.`;
    if (hasHike)
      return `Continuing from ${originName}. Drive to ${destinationName} and hit the trails.`;
    return `Continuing your journey from ${originName} to ${destinationName}.`;
  };

  const timeEstimate = estimateDayTime(day);
  const WeatherIcon = weather ? getWeatherIcon(weather.shortForecast) : null;

  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      {/* Header — mirrors the TripDetail header shape but with a day-number
          badge sitting between the back button and the title. */}
      <header className="sticky top-0 z-50 bg-cream/95 backdrop-blur-md border-b border-line">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <Link
                to={getTripUrl(generatedTrip.config.name)}
                aria-label="Back to trip"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" weight="regular" />
              </Link>

              {/* Day-number badge — prominent like the day cards in the itinerary */}
              <div className="inline-flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-pine-6/12 text-pine-6 font-mono font-bold text-[15px] sm:text-[16px] tracking-[0.02em] shrink-0">
                {dayNum}
              </div>

              <div className="min-w-0">
                <Mono className="text-pine-6">
                  Day {dayNum} of {generatedTrip.days.length}
                  <span className="text-ink-3"> · {day.drivingDistance} · {day.drivingTime}</span>
                </Mono>
                <h1 className="text-[16px] sm:text-[20px] font-sans font-bold tracking-[-0.01em] text-ink mt-0.5 flex items-center gap-2">
                  <span className="truncate max-w-[120px] sm:max-w-[200px]">{originName}</span>
                  <span className="flex-shrink-0 text-ink-3">→</span>
                  <span className="truncate max-w-[120px] sm:max-w-[200px]">{endName}</span>
                </h1>
              </div>
            </div>

            <Pill variant="solid-pine" mono={false} onClick={handleNavigateDay}>
              <NavigationArrow className="w-4 h-4" weight="regular" />
              <span className="hidden sm:inline">Navigate</span>
            </Pill>
          </div>
        </div>
      </header>

      <main className="w-full">
        <div className="grid lg:grid-cols-2">
          {/* Map */}
          <div className="order-2 lg:order-1 h-[400px] lg:h-[calc(100vh-73px)] lg:sticky lg:top-[73px]">
            <div className="relative w-full h-full">
              <GoogleMap
                center={directions ? undefined : mapCenter}
                zoom={10}
                className="w-full h-full"
                onLoad={() => setMapsLoaded(true)}
                options={{ mapTypeId: 'satellite' }}
              >
                {directions && (
                  <DirectionsRenderer
                    directions={directions}
                    options={{
                      suppressMarkers: true,
                      polylineOptions: {
                        strokeColor: '#3a4a2a',
                        strokeWeight: 5,
                        strokeOpacity: 1,
                      },
                    }}
                  />
                )}

                {dayNum === 1 && (generatedTrip.config.startLocation || generatedTrip.config.baseLocation) && (
                  <Marker
                    position={(generatedTrip.config.startLocation || generatedTrip.config.baseLocation)!.coordinates}
                    icon={createMarkerIcon('start', { isActive: true, size: 36 })}
                    title={(generatedTrip.config.startLocation || generatedTrip.config.baseLocation)!.name}
                  />
                )}

                {day.stops.map((stop) => (
                  <Marker
                    key={stop.id}
                    position={stop.coordinates}
                    icon={createMarkerIcon(stop.type, { isActive: true, size: 36 })}
                    title={stop.name}
                  />
                ))}
              </GoogleMap>

              {/* Floating route info card */}
              <div className="absolute bottom-4 left-4 right-4 z-10">
                <div className="bg-white/95 backdrop-blur-md rounded-[14px] border border-line px-4 py-3 shadow-[0_18px_44px_rgba(29,34,24,0.12)]">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-pine-6/12 text-pine-6 font-mono font-bold text-[13px]">
                        {dayNum}
                      </div>
                      <div>
                        <p className="text-[14px] font-sans font-semibold text-ink">Day {dayNum}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
                          <span className="inline-flex items-center gap-1">
                            <Path className="w-3 h-3" weight="regular" />
                            {day.drivingDistance}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" weight="regular" />
                            {day.drivingTime}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" weight="regular" />
                            {day.stops.length} {day.stops.length === 1 ? 'stop' : 'stops'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Pill variant="solid-pine" sm mono={false} onClick={handleNavigateDay}>
                      <NavigationArrow className="w-3.5 h-3.5" weight="regular" />
                      Navigate day {dayNum}
                    </Pill>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Day details */}
          <div className="order-1 lg:order-2 bg-paper lg:h-[calc(100vh-73px)] lg:overflow-y-auto">
            <div className="px-4 sm:px-6 pt-5 pb-5 space-y-5">
              {/* Day intro card — same pattern as "Your trip" on the trip
                  detail. White card on paper, mono eyebrow + sans bold route
                  title + supporting paragraph + mono-cap stat row with divider. */}
              <div className="bg-white border border-line rounded-[14px] p-5">
                <Mono className="text-pine-6">
                  Day {dayNum} of {generatedTrip.days.length}
                </Mono>
                <h1 className="text-[24px] sm:text-[32px] font-sans font-bold tracking-[-0.025em] text-ink leading-[1.1] mt-1 flex items-center gap-2 flex-wrap">
                  <span>{originName}</span>
                  <span className="text-ink-3 font-normal">→</span>
                  <span>{endName}</span>
                </h1>
                <p className="text-[14px] text-ink-3 leading-[1.55] mt-3">
                  {getDaySummary()}
                </p>

                <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
                  <span className="inline-flex items-center gap-1.5">
                    <Path className="w-3.5 h-3.5" weight="regular" />
                    {day.drivingDistance}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" weight="regular" />
                    {day.drivingTime}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" weight="regular" />
                    {day.stops.length} {day.stops.length === 1 ? 'stop' : 'stops'}
                  </span>
                  {weatherLoading && (
                    <span className="inline-flex items-center gap-1.5">
                      <SpinnerGap className="w-3.5 h-3.5 animate-spin" />
                      Loading weather
                    </span>
                  )}
                  {weather && !weatherLoading && WeatherIcon && (
                    <span className="inline-flex items-center gap-1.5" title={weather.shortForecast}>
                      <WeatherIcon className="w-3.5 h-3.5" weight="regular" />
                      {weather.temperature}°{weather.temperatureUnit}
                      <span className="hidden sm:inline opacity-70">{weather.shortForecast}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Day overload warning */}
              {timeEstimate.warningMessage && (
                <div
                  className={cn(
                    'flex items-start gap-3 p-4 rounded-[14px] border',
                    timeEstimate.isOverloaded
                      ? 'bg-clay/8 border-clay/40'
                      : 'bg-water/8 border-water/40',
                  )}
                >
                  <Warning
                    className={cn(
                      'w-4 h-4 flex-shrink-0 mt-0.5',
                      timeEstimate.isOverloaded ? 'text-clay' : 'text-water',
                    )}
                    weight="regular"
                  />
                  <div>
                    <Mono className={timeEstimate.isOverloaded ? 'text-clay' : 'text-water'}>
                      {timeEstimate.isOverloaded ? 'Ambitious schedule' : 'Heads up'}
                    </Mono>
                    <p className="text-[13px] text-ink-3 mt-1 leading-[1.5]">
                      {timeEstimate.warningMessage}
                    </p>
                  </div>
                </div>
              )}

              {/* Stops */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Mono className="text-ink-2">Stops</Mono>
                  <Pill variant="ghost" sm mono={false} onClick={() => setAddStopModalOpen(true)}>
                    <Plus className="w-3.5 h-3.5" weight="bold" />
                    Add hike
                  </Pill>
                </div>

                {day.stops.length === 0 ? (
                  <div className="border border-dashed border-line bg-white/50 rounded-[14px] px-6 py-10 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 text-pine-6 mb-3">
                      <MapPin className="w-5 h-5" weight="regular" />
                    </div>
                    <p className="text-[14px] font-sans font-semibold text-ink">No stops planned</p>
                    <p className="text-[13px] text-ink-3 mt-1">Add hikes, camps, or stops to fill out the day.</p>
                  </div>
                ) : (
                  /* Stops timeline — each card connects to the next via a thin
                     vertical line aligned to the icon column, so the day reads
                     as one continuous route. */
                  <div className="space-y-0">
                    {day.stops.map((stop, index) => {
                      const { Icon, bg, text } = styleFor(stop.type);
                      const isLast = index === day.stops.length - 1;
                      return (
                        <div key={stop.id} className="relative">
                          <div className="border border-line bg-white rounded-[14px] p-4 group hover:border-ink-3/40 transition-colors">
                            <div className="flex items-start gap-3">
                              <IconBlock Icon={Icon} bg={bg} text={text} />

                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <h4 className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">
                                      {stop.name}
                                    </h4>
                                    <p className="text-[13px] text-ink-3 mt-0.5 leading-[1.5]">
                                      {stop.description}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {stop.type === 'hike' && (
                                      <button
                                        onClick={() => handleOpenHikeSwap(stop)}
                                        title="Swap hike"
                                        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sage hover:bg-sage/15 transition-colors"
                                      >
                                        <ArrowsClockwise className="w-3.5 h-3.5" weight="bold" />
                                      </button>
                                    )}
                                    {stop.type === 'camp' && (
                                      <button
                                        onClick={() => handleOpenCampsiteSwap(stop)}
                                        title="Swap campsite"
                                        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-clay hover:bg-clay/15 transition-colors"
                                      >
                                        <ArrowsClockwise className="w-3.5 h-3.5" weight="bold" />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleRemoveStop(stop)}
                                      title="Remove stop"
                                      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-ink-3 hover:text-ember hover:bg-ember/10 transition-colors"
                                    >
                                      <Trash className="w-3.5 h-3.5" weight="regular" />
                                    </button>
                                  </div>
                                </div>

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
                                      className="inline-flex items-center gap-1 text-sage hover:text-sage/80 transition-colors"
                                    >
                                      <ArrowSquareOut className="w-3 h-3" weight="regular" />
                                      AllTrails
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Connector — sits in the 16px gap below each card,
                              aligned to the icon column (left-1 + p-4 = 16px,
                              icon center is 16+18=34px from card edge). */}
                          {!isLast && (
                            <div
                              aria-hidden
                              className="ml-[33px] h-4 w-0.5 bg-line"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Day navigation */}
              <div className="flex gap-2 pt-2">
                {dayNum > 1 ? (
                  <Link to={getDayUrl(generatedTrip.config.name, dayNum - 1)} className="flex-1">
                    <Pill variant="ghost" mono={false} className="!w-full !justify-center">
                      <ArrowLeft className="w-3.5 h-3.5" weight="bold" />
                      Day {dayNum - 1}
                    </Pill>
                  </Link>
                ) : (
                  <div className="flex-1" />
                )}
                {dayNum < generatedTrip.days.length && (
                  <Link to={getDayUrl(generatedTrip.config.name, dayNum + 1)} className="flex-1">
                    <Pill variant="ghost" mono={false} className="!w-full !justify-center">
                      Day {dayNum + 1}
                      <ArrowRight className="w-3.5 h-3.5" weight="bold" />
                    </Pill>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      {selectedHikeForSwap && (
        <AlternativeHikesModal
          isOpen={hikeModalOpen}
          onClose={() => {
            setHikeModalOpen(false);
            setSelectedHikeForSwap(null);
          }}
          currentHike={selectedHikeForSwap}
          searchLat={selectedHikeForSwap.coordinates.lat}
          searchLng={selectedHikeForSwap.coordinates.lng}
          onSelectHike={handleSwapHike}
        />
      )}

      <AddStopModal
        isOpen={addStopModalOpen}
        onClose={() => setAddStopModalOpen(false)}
        dayNumber={dayNum}
        searchLat={mainDestination?.coordinates.lat || mapCenter.lat}
        searchLng={mainDestination?.coordinates.lng || mapCenter.lng}
        existingStopIds={day.stops.map((s) => s.placeId || s.id).filter(Boolean)}
        onAddStop={handleAddStop}
      />

      {selectedCampsiteForSwap && (
        <AlternativeCampsitesModal
          isOpen={campsiteModalOpen}
          onClose={() => {
            setCampsiteModalOpen(false);
            setSelectedCampsiteForSwap(null);
          }}
          currentCampsite={selectedCampsiteForSwap}
          searchLat={selectedCampsiteForSwap.coordinates.lat}
          searchLng={selectedCampsiteForSwap.coordinates.lng}
          onSelectCampsite={handleSwapCampsite}
        />
      )}
    </div>
  );
};

export default DayDetail;
