import { useState, useEffect, useMemo } from 'react';
import {
  Camera,
  Sun,
  SunHorizon,
  CloudSun,
  ArrowsClockwise,
  Compass,
  Moon,
  Mountains,
  SunDim,
  Star,
  Check,
  X,
  Question,
  Sparkle,
  CloudArrowDown,
  Drop,
  Wind,
  Eye,
  ThermometerSimple,
  Mountains as MountainsIcon,
} from '@phosphor-icons/react';
import { LocationSelector, SelectedLocation } from '@/components/LocationSelector';
import { Header } from '@/components/Header';
import { GoogleMap } from '@/components/GoogleMap';
import { AdvancedMarker } from '@/components/AdvancedMarker';
import { formatTime, getSunTimes, formatAzimuth, SunTimes } from '@/utils/sunCalc';
import { analyzeHorizonProfile, getElevation, HorizonProfile } from '@/utils/terrainVisibility';
import { analyzePhotoConditions, PhotoForecast, OpenMeteoHourly } from '@/utils/photoConditionsAnalyzer';
import { analyzeTerrainFeatures, TerrainFeature } from '@/utils/terrainPhotoAnalyzer';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

type SunEventType = 'sunrise' | 'sunset';

interface DayForecast {
  date: Date;
  dateLabel: string;
  sunTimes: SunTimes;
  sunriseIndex: number | null;
  sunsetIndex: number | null;
  sunriseForecast: PhotoForecast | null;
  sunsetForecast: PhotoForecast | null;
}

interface OpenMeteoResponse {
  current?: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    weather_code: number;
    cloud_cover: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    dew_point_2m: number[];
    precipitation_probability: number[];
    precipitation: number[];
    weather_code: number[];
    cloud_cover: number[];
    cloud_cover_low: number[];
    cloud_cover_mid: number[];
    cloud_cover_high: number[];
    visibility: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    wind_gusts_10m: number[];
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise: string[];
    sunset: string[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
  };
}

const WMO_CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
};

// Quality → accent token mapping (Pine + Paper)
type Rating = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

const RATING_TONES: Record<Rating, { bg: string; border: string; text: string; solid: string; chip: string }> = {
  excellent: { bg: 'bg-pine-6/[0.06]', border: 'border-pine-6/30', text: 'text-pine-6', solid: 'bg-pine-6 text-cream', chip: 'bg-pine-6/12 text-pine-6' },
  good:      { bg: 'bg-water/[0.06]',  border: 'border-water/30',  text: 'text-water',  solid: 'bg-water text-cream',  chip: 'bg-water/15 text-water' },
  fair:      { bg: 'bg-clay/[0.06]',   border: 'border-clay/30',   text: 'text-clay',   solid: 'bg-clay text-cream',   chip: 'bg-clay/15 text-clay' },
  poor:      { bg: 'bg-ember/[0.06]',  border: 'border-ember/30',  text: 'text-ember',  solid: 'bg-ember text-cream',  chip: 'bg-ember/15 text-ember' },
  unknown:   { bg: 'bg-cream',         border: 'border-line',      text: 'text-ink-3',  solid: 'bg-ink-3 text-cream',  chip: 'bg-cream text-ink-3' },
};

function getQualityIcon(forecast: PhotoForecast | null, size: number = 16) {
  if (!forecast) return <Question className="text-ink-3" style={{ width: size, height: size }} />;
  switch (forecast.rating) {
    case 'excellent': return <Star weight="fill" className="text-pine-6" style={{ width: size, height: size }} />;
    case 'good':      return <Check weight="bold" className="text-water" style={{ width: size, height: size }} />;
    case 'fair':      return <Sun className="text-clay" style={{ width: size, height: size }} />;
    case 'poor':      return <X weight="bold" className="text-ember" style={{ width: size, height: size }} />;
  }
}

interface PhotoWeatherTestProps {
  previewMode?: boolean;
  initialLocation?: SelectedLocation | null;
}

export default function PhotoWeatherTest({ previewMode = false, initialLocation = null }: PhotoWeatherTestProps) {
  const [location, setLocation] = useState<SelectedLocation | null>(initialLocation);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const pinContent = useMemo(() => {
    const div = document.createElement('div');
    div.style.width = '20px';
    div.style.height = '20px';
    div.style.borderRadius = '50%';
    div.style.backgroundColor = '#EA4335';
    div.style.border = '2px solid #ffffff';
    return div;
  }, []);
  const [openMeteoData, setOpenMeteoData] = useState<OpenMeteoResponse | null>(null);
  const [openMeteoLoading, setOpenMeteoLoading] = useState(false);
  const [horizonProfile, setHorizonProfile] = useState<HorizonProfile | null>(null);
  const [horizonLoading, setHorizonLoading] = useState(false);
  const [horizonError, setHorizonError] = useState<string | null>(null);
  const [photoForecast, setPhotoForecast] = useState<PhotoForecast | null>(null);
  const [activeTab, setActiveTab] = useState<SunEventType>('sunset');
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  const [terrainFeatures, setTerrainFeatures] = useState<TerrainFeature[]>([]);
  const [terrainLoading, setTerrainLoading] = useState(false);
  const [terrainError, setTerrainError] = useState<string | null>(null);

  // Open-Meteo
  useEffect(() => {
    if (!location) return;
    const fetchOpenMeteo = async () => {
      setOpenMeteoLoading(true);
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const response = await fetch(
          `${supabaseUrl}/functions/v1/openmeteo-proxy?lat=${location.lat}&lng=${location.lng}`,
          {
            headers: {
              'Authorization': `Bearer ${anonKey}`,
              'apikey': anonKey,
              'Content-Type': 'application/json',
            },
          },
        );
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json();
        setOpenMeteoData(data);
      } catch (err) {
        console.error('Open-Meteo fetch error:', err);
      } finally {
        setOpenMeteoLoading(false);
      }
    };
    fetchOpenMeteo();
  }, [location]);

  const sunTimes = useMemo(() => {
    if (!location) return null;
    return getSunTimes(location.lat, location.lng, new Date());
  }, [location]);

  const multiDayForecast = useMemo((): DayForecast[] => {
    if (!location || !openMeteoData?.hourly?.time) return [];

    const forecasts: DayForecast[] = [];
    const now = new Date();

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = new Date(now);
      date.setDate(date.getDate() + dayOffset);
      date.setHours(12, 0, 0, 0);

      const dayTimes = getSunTimes(location.lat, location.lng, date);
      const dateStr = date.toDateString();

      let sunriseIndex: number | null = null;
      let sunsetIndex: number | null = null;

      const sunriseHour = dayTimes.sunrise.getHours();
      const sunsetHour = dayTimes.sunset.getHours();

      openMeteoData.hourly!.time.forEach((t, i) => {
        const d = new Date(t);
        if (d.toDateString() === dateStr) {
          if (d.getHours() === sunriseHour) sunriseIndex = i;
          if (d.getHours() === sunsetHour) sunsetIndex = i;
        }
      });

      let sunriseForecast: PhotoForecast | null = null;
      let sunsetForecast: PhotoForecast | null = null;

      if (sunriseIndex !== null && openMeteoData.hourly) {
        sunriseForecast = analyzePhotoConditions(openMeteoData.hourly as OpenMeteoHourly, sunriseIndex, undefined);
      }
      if (sunsetIndex !== null && openMeteoData.hourly) {
        sunsetForecast = analyzePhotoConditions(openMeteoData.hourly as OpenMeteoHourly, sunsetIndex, undefined);
      }

      let dateLabel: string;
      if (dayOffset === 0) dateLabel = 'Today';
      else if (dayOffset === 1) dateLabel = 'Tomorrow';
      else dateLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      forecasts.push({ date, dateLabel, sunTimes: dayTimes, sunriseIndex, sunsetIndex, sunriseForecast, sunsetForecast });
    }
    return forecasts;
  }, [location, openMeteoData]);

  const getEffectiveDayIndex = useMemo(() => {
    if (multiDayForecast.length === 0) return 0;
    const now = new Date();
    const todayForecast = multiDayForecast[0];
    const hoursAfter = 3;

    if (activeTab === 'sunrise') {
      const cutoffTime = new Date(todayForecast.sunTimes.sunrise.getTime() + hoursAfter * 60 * 60 * 1000);
      if (now > cutoffTime) return selectedDayIndex === 0 ? 1 : selectedDayIndex;
    } else {
      const cutoffTime = new Date(todayForecast.sunTimes.sunset.getTime() + hoursAfter * 60 * 60 * 1000);
      if (now > cutoffTime) return selectedDayIndex === 0 ? 1 : selectedDayIndex;
    }
    return selectedDayIndex;
  }, [multiDayForecast, activeTab, selectedDayIndex]);

  const selectedDayForecast = multiDayForecast[getEffectiveDayIndex] || null;
  const selectedSunTimes = selectedDayForecast?.sunTimes || sunTimes;

  // Horizon
  useEffect(() => {
    if (!location || !selectedSunTimes) return;
    const fetchHorizonProfile = async () => {
      setHorizonLoading(true);
      setHorizonError(null);
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        const observerElevation = await getElevation(location.lat, location.lng, supabaseUrl, anonKey);
        const azimuth = activeTab === 'sunrise' ? selectedSunTimes.sunriseAzimuth : selectedSunTimes.sunsetAzimuth;
        const profile = await analyzeHorizonProfile(location.lat, location.lng, observerElevation, azimuth, 0, supabaseUrl, anonKey, 30, 15);
        setHorizonProfile(profile);
      } catch (err) {
        console.error('Horizon profile error:', err);
        setHorizonError(err instanceof Error ? err.message : 'Failed to analyze terrain');
      } finally {
        setHorizonLoading(false);
      }
    };
    fetchHorizonProfile();
  }, [location, selectedSunTimes, activeTab]);

  const selectedEventIndex = useMemo(() => {
    if (!selectedDayForecast) return null;
    return activeTab === 'sunrise' ? selectedDayForecast.sunriseIndex : selectedDayForecast.sunsetIndex;
  }, [selectedDayForecast, activeTab]);

  useEffect(() => {
    if (!openMeteoData?.hourly || selectedEventIndex === null || selectedEventIndex < 0) {
      setPhotoForecast(null);
      return;
    }
    const forecast = analyzePhotoConditions(openMeteoData.hourly as OpenMeteoHourly, selectedEventIndex, horizonProfile ?? undefined);
    setPhotoForecast(forecast);
  }, [openMeteoData, selectedEventIndex, horizonProfile]);

  // Terrain features
  useEffect(() => {
    if (!location || !selectedSunTimes) return;
    const fetchTerrainFeatures = async () => {
      setTerrainLoading(true);
      setTerrainError(null);
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const sunAzimuth = activeTab === 'sunrise' ? selectedSunTimes.sunriseAzimuth : selectedSunTimes.sunsetAzimuth;
        const isSunrise = activeTab === 'sunrise';
        const features = await analyzeTerrainFeatures(location.lat, location.lng, sunAzimuth, isSunrise, 10, supabaseUrl, anonKey);
        setTerrainFeatures(features);
      } catch (err) {
        console.error('Terrain analysis error:', err);
        setTerrainError(err instanceof Error ? err.message : 'Failed to analyze terrain');
      } finally {
        setTerrainLoading(false);
      }
    };
    fetchTerrainFeatures();
  }, [location, selectedSunTimes, activeTab]);

  const getShootWindow = useMemo(() => {
    if (!selectedSunTimes || !photoForecast) return null;
    const isSunrise = activeTab === 'sunrise';
    const goldenStart = isSunrise
      ? new Date(selectedSunTimes.goldenHourMorning.start)
      : new Date(selectedSunTimes.goldenHourEvening.start);
    const sunEvent = isSunrise ? new Date(selectedSunTimes.sunrise) : new Date(selectedSunTimes.sunset);
    const twilightEnd = isSunrise
      ? new Date(selectedSunTimes.goldenHourMorning.end)
      : new Date(selectedSunTimes.civilDusk);

    let windowStart = goldenStart;
    let windowEnd = twilightEnd;
    let peakStart: Date;
    let peakEnd: Date;

    if (isSunrise) {
      peakStart = new Date(sunEvent.getTime() - 15 * 60000);
      peakEnd = new Date(sunEvent.getTime() + 20 * 60000);
    } else {
      peakStart = new Date(sunEvent.getTime() - 20 * 60000);
      peakEnd = new Date(sunEvent.getTime() + 15 * 60000);
    }

    let afterglowEnd: Date | null = null;
    const hasHighClouds = photoForecast.clouds.high >= 20;
    if (hasHighClouds && !isSunrise) {
      afterglowEnd = new Date(sunEvent.getTime() + 30 * 60000);
      windowEnd = new Date(Math.max(twilightEnd.getTime(), afterglowEnd.getTime()));
    }

    const timingRec = photoForecast.timing.recommendation.toLowerCase();
    if (timingRec.includes('early')) {
      windowEnd = new Date(sunEvent.getTime() + 5 * 60000);
      peakStart = new Date(sunEvent.getTime() - 30 * 60000);
      peakEnd = sunEvent;
      afterglowEnd = null;
    } else if (timingRec.includes('late') && !isSunrise) {
      windowStart = new Date(sunEvent.getTime() - 15 * 60000);
      windowEnd = new Date(twilightEnd.getTime() + 15 * 60000);
      peakStart = new Date(sunEvent.getTime() + 5 * 60000);
      peakEnd = new Date(sunEvent.getTime() + 25 * 60000);
      afterglowEnd = new Date(sunEvent.getTime() + 30 * 60000);
    }

    if (horizonProfile && horizonProfile.effectiveHorizon > 4) {
      const minutesLost = horizonProfile.sunsetLostMinutes;
      if (isSunrise) {
        peakStart = new Date(peakStart.getTime() + minutesLost * 60000);
        peakEnd = new Date(peakEnd.getTime() + Math.floor(minutesLost / 2) * 60000);
      } else {
        windowStart = new Date(goldenStart.getTime() - 10 * 60000);
        peakStart = new Date(peakStart.getTime() - minutesLost * 60000);
        peakEnd = new Date(peakEnd.getTime() - Math.floor(minutesLost / 2) * 60000);
      }
    }

    if (photoForecast.clouds.low > 50) {
      if (isSunrise) {
        peakStart = new Date(sunEvent.getTime() + 20 * 60000);
        windowEnd = new Date(twilightEnd.getTime() + 15 * 60000);
      } else {
        windowStart = new Date(goldenStart.getTime() - 15 * 60000);
        peakStart = new Date(sunEvent.getTime() - 40 * 60000);
      }
    }

    return {
      windowStart, windowEnd, peakStart, peakEnd, afterglowEnd, hasHighClouds, isSunrise,
      duration: Math.round((windowEnd.getTime() - windowStart.getTime()) / 60000),
    };
  }, [selectedSunTimes, photoForecast, horizonProfile, activeTab]);

  const mapCenter = useMemo(
    () => (location ? { lat: location.lat, lng: location.lng } : { lat: 38.5, lng: -109.5 }),
    [location],
  );

  const ratingTone = (rating: Rating | undefined) => RATING_TONES[rating || 'unknown'];

  return (
    <div className={cn(previewMode ? 'min-h-screen bg-paper text-ink font-sans' : 'h-screen bg-paper text-ink font-sans flex flex-col overflow-hidden')}>
      {!previewMode && <Header showBorder />}

      <div className={previewMode ? '' : 'flex-1 flex overflow-hidden'}>
        {/* Map — left half (desktop only, hidden in preview) */}
        {!previewMode && (
          <div className="hidden lg:block lg:w-1/2 relative">
            <GoogleMap
              center={mapCenter}
              zoom={location ? 10 : 6}
              className="w-full h-full"
              onLoad={setMapInstance}
              options={{ mapTypeId: 'satellite' }}
            >
              {location && (
                <AdvancedMarker
                  map={mapInstance}
                  position={{ lat: location.lat, lng: location.lng }}
                  title={location.name}
                  content={pinContent}
                />
              )}
            </GoogleMap>
          </div>
        )}

        {/* Content panel */}
        <div className={previewMode ? 'max-w-xl mx-auto px-4 py-6' : 'flex-1 lg:w-1/2 overflow-y-auto'}>
          {/* Header */}
          {!previewMode ? (
            <div className="sticky top-0 z-10 bg-cream/95 dark:bg-paper-2/95 backdrop-blur-md border-b border-line px-4 sm:px-6 py-4">
              <Mono className="text-pine-6 inline-flex items-center gap-1.5">
                <Sparkle className="w-3.5 h-3.5" weight="regular" />
                Light Report
              </Mono>
              <h1 className="text-[24px] sm:text-[28px] font-sans font-bold tracking-[-0.02em] text-ink leading-[1.1] mt-1 mb-3">
                Plan the perfect golden hour.
              </h1>
              <LocationSelector
                value={location}
                onChange={setLocation}
                placeholder="Search for a location…"
                showMyLocation
                showSavedLocations
                showCoordinates
                compact
                coordinatesDisplay={
                  location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : undefined
                }
              />
            </div>
          ) : (
            <div className="mb-5">
              <Mono className="text-pine-6 inline-flex items-center gap-1.5">
                <Sparkle className="w-3.5 h-3.5" weight="regular" />
                Light Report
              </Mono>
              <h1 className="text-[28px] font-sans font-bold tracking-[-0.025em] text-ink leading-[1.1] mt-1">
                Plan the perfect golden hour.
              </h1>
              {location?.name && (
                <p className="text-[14px] text-ink-3 mt-2">{location.name}</p>
              )}
            </div>
          )}

          <main className={cn('space-y-5', !previewMode && 'px-4 sm:px-6 py-5')}>
            {/* Sunrise / Sunset tabs + 7-day forecast */}
            {location && (
              <div className="bg-white border border-line rounded-[14px] p-4 space-y-4">
                {/* Tab Buttons */}
                <div className="flex gap-1 p-1 bg-cream rounded-full">
                  <TabButton active={activeTab === 'sunrise'} onClick={() => { setActiveTab('sunrise'); setSelectedDayIndex(0); }}>
                    <SunDim className="w-3.5 h-3.5" weight="regular" />
                    Sunrise
                  </TabButton>
                  <TabButton active={activeTab === 'sunset'} onClick={() => { setActiveTab('sunset'); setSelectedDayIndex(0); }}>
                    <SunHorizon className="w-3.5 h-3.5" weight="regular" />
                    Sunset
                  </TabButton>
                </div>

                {/* 7-day grid */}
                {multiDayForecast.length > 0 && (
                  <div>
                    <Mono className="text-ink-3 mb-2 block">7-day outlook</Mono>
                    <div className="grid grid-cols-7 gap-1">
                      {multiDayForecast.map((day, index) => {
                        const forecast = activeTab === 'sunrise' ? day.sunriseForecast : day.sunsetForecast;
                        const isSelected = index === getEffectiveDayIndex;
                        const eventTime = activeTab === 'sunrise' ? day.sunTimes.sunrise : day.sunTimes.sunset;
                        const cutoffTime = new Date(eventTime.getTime() + 3 * 60 * 60 * 1000);
                        const isPast = index === 0 && new Date() > cutoffTime;

                        return (
                          <button
                            key={index}
                            onClick={() => setSelectedDayIndex(index)}
                            disabled={isPast}
                            className={cn(
                              'p-2 rounded-[10px] text-center transition-all border',
                              isSelected
                                ? 'bg-ink text-cream border-ink'
                                : isPast
                                  ? 'opacity-30 cursor-not-allowed border-line'
                                  : 'border-line hover:border-ink-3 hover:bg-cream cursor-pointer',
                            )}
                          >
                            <div
                              className={cn(
                                'text-[10px] font-mono uppercase tracking-[0.08em] font-semibold truncate',
                                isSelected ? 'text-cream/80' : 'text-ink-3',
                              )}
                            >
                              {day.dateLabel}
                            </div>
                            <div className="flex justify-center my-1.5">{getQualityIcon(forecast, 16)}</div>
                            <div
                              className={cn(
                                'text-[11px] font-sans font-semibold',
                                isSelected ? 'text-cream' : 'text-ink',
                              )}
                            >
                              {formatTime(activeTab === 'sunrise' ? day.sunTimes.sunrise : day.sunTimes.sunset)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Photography forecast hero + breakdown */}
            {photoForecast && selectedSunTimes && (
              <div className="space-y-5">
                {/* Hero score card */}
                <div
                  className={cn(
                    'rounded-[14px] border p-5',
                    ratingTone(photoForecast.rating).bg,
                    ratingTone(photoForecast.rating).border,
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        'w-16 h-16 rounded-[14px] flex items-center justify-center font-sans font-bold text-[26px] shrink-0',
                        ratingTone(photoForecast.rating).solid,
                      )}
                    >
                      {photoForecast.score}
                    </div>
                    <div className="min-w-0">
                      <Mono className={ratingTone(photoForecast.rating).text}>
                        {photoForecast.rating?.toUpperCase() || 'CONDITIONS'}
                      </Mono>
                      <p className="text-[18px] font-sans font-bold tracking-[-0.015em] text-ink leading-[1.2] mt-0.5">
                        {photoForecast.headline}
                      </p>
                      <Mono className="text-ink-3 mt-1.5 block">
                        {selectedDayForecast?.dateLabel || 'Today'} ·{' '}
                        {formatTime(activeTab === 'sunrise' ? selectedSunTimes.sunrise : selectedSunTimes.sunset)} ·{' '}
                        {formatAzimuth(activeTab === 'sunrise' ? selectedSunTimes.sunriseAzimuth : selectedSunTimes.sunsetAzimuth)}
                      </Mono>
                    </div>
                  </div>
                </div>

                {/* Recommended shoot window */}
                {getShootWindow && (
                  <div className="bg-white border border-line rounded-[14px] p-5">
                    <div className="flex items-center justify-between mb-3">
                      <Mono className="text-clay inline-flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5" weight="regular" />
                        Recommended shoot window
                      </Mono>
                      <Mono className="text-ink-3">~{getShootWindow.duration} min</Mono>
                    </div>

                    {/* Timeline */}
                    <div className="relative h-9 rounded-full mb-4 overflow-hidden border border-line bg-gradient-to-r from-clay/30 via-ember/30 to-water/40">
                      {/* Peak window highlight */}
                      <div
                        className="absolute h-full bg-pine-6/60 border-x border-pine-7"
                        style={{
                          left: `${
                            ((getShootWindow.peakStart.getTime() - getShootWindow.windowStart.getTime()) /
                              (getShootWindow.windowEnd.getTime() - getShootWindow.windowStart.getTime())) *
                            100
                          }%`,
                          width: `${
                            ((getShootWindow.peakEnd.getTime() - getShootWindow.peakStart.getTime()) /
                              (getShootWindow.windowEnd.getTime() - getShootWindow.windowStart.getTime())) *
                            100
                          }%`,
                        }}
                      />
                      {/* Sun event marker */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-ember"
                        style={{
                          left: `${
                            (((activeTab === 'sunrise' ? selectedSunTimes.sunrise : selectedSunTimes.sunset).getTime() -
                              getShootWindow.windowStart.getTime()) /
                              (getShootWindow.windowEnd.getTime() - getShootWindow.windowStart.getTime())) *
                            100
                          }%`,
                        }}
                      />
                    </div>

                    {/* 3-up times */}
                    <div className="grid grid-cols-3 gap-2">
                      <TimeBlock label="Arrive by" value={formatTime(getShootWindow.windowStart)} />
                      <TimeBlock
                        label="Peak color"
                        value={`${formatTime(getShootWindow.peakStart)} – ${formatTime(getShootWindow.peakEnd)}`}
                        accent="pine"
                        align="center"
                      />
                      <TimeBlock label="Pack up" value={formatTime(getShootWindow.windowEnd)} align="right" />
                    </div>

                    {/* Tips */}
                    {(photoForecast.timing.recommendation !== 'flexible' ||
                      (getShootWindow.hasHighClouds && getShootWindow.afterglowEnd)) && (
                      <div className="mt-4 pt-3 border-t border-line space-y-1.5">
                        {photoForecast.timing.recommendation !== 'flexible' && (
                          <p className="text-[12px] text-clay leading-[1.5] inline-flex items-start gap-1.5">
                            <Sparkle className="w-3 h-3 mt-0.5 shrink-0" weight="regular" />
                            {photoForecast.timing.reason}
                          </p>
                        )}
                        {getShootWindow.hasHighClouds && getShootWindow.afterglowEnd && (
                          <p className="text-[12px] text-water leading-[1.5] inline-flex items-start gap-1.5">
                            <Sparkle className="w-3 h-3 mt-0.5 shrink-0" weight="regular" />
                            High clouds — afterglow may persist until {formatTime(getShootWindow.afterglowEnd)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Score breakdown bars */}
                <div className="bg-white border border-line rounded-[14px] p-5">
                  <Mono className="text-ink-2 mb-3 block">Score breakdown</Mono>
                  <div className="space-y-2.5">
                    {photoForecast.insights.map((insight, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-20 text-[12px] text-ink-3 font-sans">{insight.factor}</div>
                        <div className="flex-1 h-1.5 bg-cream rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-pine-6"
                            style={{ width: `${insight.score}%` }}
                          />
                        </div>
                        <div className="w-8 text-[11px] text-right font-mono text-ink-3">{insight.score}</div>
                      </div>
                    ))}
                  </div>

                  {/* Factor cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 pt-4 border-t border-line">
                    {photoForecast.insights.map((insight, i) => (
                      <div key={i} className="px-3 py-2.5 rounded-[10px] bg-cream border border-line">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-sans font-semibold tracking-[-0.005em] text-ink">
                            {insight.factor}
                          </span>
                          <Mono className="text-ink-3 shrink-0">{insight.value}</Mono>
                        </div>
                        <p className="text-[12px] text-ink-3 mt-1 leading-[1.5]">{insight.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cloud layers + atmosphere */}
                <div className="bg-white border border-line rounded-[14px] p-5 space-y-5">
                  <div>
                    <Mono className="text-ink-2 mb-2.5 block inline-flex items-center gap-1.5">
                      <CloudArrowDown className="w-3 h-3" weight="regular" />
                      Cloud layers
                    </Mono>
                    <div className="grid grid-cols-4 gap-2">
                      <CloudTile
                        label="High"
                        value={photoForecast.clouds.high}
                        good={photoForecast.clouds.high >= 20 && photoForecast.clouds.high <= 60}
                      />
                      <CloudTile
                        label="Mid"
                        value={photoForecast.clouds.mid}
                        good={photoForecast.clouds.mid >= 20 && photoForecast.clouds.mid <= 50}
                      />
                      <CloudTile
                        label="Low"
                        value={photoForecast.clouds.low}
                        warn={photoForecast.clouds.low >= 30 && photoForecast.clouds.low < 50}
                        bad={photoForecast.clouds.low >= 50}
                      />
                      <CloudTile label="Total" value={photoForecast.clouds.total} />
                    </div>
                  </div>

                  {/* Conditions alert */}
                  {photoForecast.conditions.isClearing && (
                    <div className="px-3.5 py-3 rounded-[10px] border border-pine-6/30 bg-pine-6/[0.06]">
                      <Mono className="text-pine-6 inline-flex items-center gap-1.5">
                        <CloudSun className="w-3 h-3" weight="regular" />
                        Post-storm clearing
                      </Mono>
                      <p className="text-[13px] text-ink-2 mt-1 leading-[1.5]">
                        Exceptional color potential as skies clear.
                      </p>
                    </div>
                  )}

                  {/* Atmosphere */}
                  <div>
                    <Mono className="text-ink-2 mb-2.5 block">Atmosphere</Mono>
                    <div className="grid grid-cols-2 gap-2">
                      <AtmoTile Icon={Eye} label="Visibility" value={`${photoForecast.atmosphere.visibility.toFixed(0)} km`} />
                      <AtmoTile Icon={Drop} label="Humidity" value={`${Math.round(photoForecast.atmosphere.humidity)}%`} />
                      <AtmoTile
                        Icon={ThermometerSimple}
                        label="Aerosols"
                        value={photoForecast.atmosphere.aod !== null ? photoForecast.atmosphere.aod.toFixed(2) : 'N/A'}
                      />
                      <AtmoTile Icon={Wind} label="Precipitation" value={`${photoForecast.conditions.precipitation}%`} />
                    </div>

                    {photoForecast.conditions.fogRisk && (
                      <div className="mt-2.5 px-3 py-2.5 rounded-[10px] bg-water/[0.08] border border-water/30">
                        <Mono className="text-water inline-flex items-center gap-1.5">
                          <Drop className="w-3 h-3" weight="regular" />
                          Fog/mist possible
                        </Mono>
                        <p className="text-[12px] text-ink-2 mt-1 leading-[1.5]">
                          Temperature near dew point — fog or mist may form, creating moody atmosphere.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Terrain analysis */}
            {location && selectedSunTimes && (
              <div className="bg-white border border-line rounded-[14px] p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <Mono className="text-pine-6 inline-flex items-center gap-1.5">
                    <Mountains className="w-3.5 h-3.5" weight="regular" />
                    Terrain analysis
                  </Mono>
                  <Mono className="text-ink-3">Catching {activeTab} light</Mono>
                </div>

                {terrainLoading && (
                  <div className="flex flex-col items-center py-8 gap-2">
                    <ArrowsClockwise className="w-5 h-5 text-pine-6 animate-spin" />
                    <Mono className="text-pine-6">Analyzing terrain features…</Mono>
                  </div>
                )}

                {terrainError && (
                  <div className="px-3 py-2.5 rounded-[10px] border border-ember/30 bg-ember/[0.06]">
                    <p className="text-[13px] text-ember leading-[1.5]">{terrainError}</p>
                  </div>
                )}

                {!terrainLoading && !terrainError && terrainFeatures.length === 0 && (
                  <div className="text-center py-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sage/15 text-sage mb-2.5">
                      <Mountains className="w-5 h-5" weight="regular" />
                    </div>
                    <Mono className="text-ink-3">No terrain features found</Mono>
                    <p className="text-[12px] text-ink-3 mt-1">This area may be flat or features lack trail access.</p>
                  </div>
                )}

                {!terrainLoading && terrainFeatures.length > 0 && (
                  <div className="space-y-2">
                    {terrainFeatures.map((feature, index) => (
                      <TerrainFeatureRow key={`terrain-${index}`} feature={feature} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Loading state */}
            {location && !photoForecast && (openMeteoLoading || horizonLoading) && (
              <div className="bg-white border border-line rounded-[14px] py-12 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 mb-2.5">
                  <ArrowsClockwise className="w-5 h-5 text-pine-6 animate-spin" />
                </div>
                <Mono className="text-pine-6">Analyzing photography conditions…</Mono>
              </div>
            )}

            {/* Sun position & twilight */}
            {location && selectedSunTimes && (
              <div className="bg-white border border-line rounded-[14px] p-5">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <Mono className="text-clay inline-flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5" weight="regular" />
                    Sun position &amp; twilight
                  </Mono>
                  <Mono className="text-ink-3">{selectedDayForecast?.dateLabel || 'Today'}</Mono>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  <SunBlock
                    Icon={SunDim}
                    label="Sunrise"
                    time={formatTime(selectedSunTimes.sunrise)}
                    azimuth={formatAzimuth(selectedSunTimes.sunriseAzimuth)}
                    active={activeTab === 'sunrise'}
                  />
                  <SunBlock
                    Icon={SunHorizon}
                    label="Sunset"
                    time={formatTime(selectedSunTimes.sunset)}
                    azimuth={formatAzimuth(selectedSunTimes.sunsetAzimuth)}
                    active={activeTab === 'sunset'}
                  />
                  <SunBlock
                    Icon={Sun}
                    label="Solar noon"
                    time={formatTime(selectedSunTimes.solarNoon)}
                  />
                </div>

                {/* Twilight phases */}
                <div className="mt-5 pt-4 border-t border-line">
                  <Mono className="text-ink-2 mb-3 inline-flex items-center gap-1.5">
                    <Moon className="w-3 h-3" weight="regular" />
                    {activeTab === 'sunrise' ? 'Morning twilight phases' : 'Evening twilight phases'}
                  </Mono>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {activeTab === 'sunrise' ? (
                      <>
                        <PhaseTile accent="pine" label="Astronomical dawn" time={formatTime(selectedSunTimes.astronomicalDawn)} sub="Sun -18° to -12°" />
                        <PhaseTile accent="water" label="Nautical dawn" time={formatTime(selectedSunTimes.nauticalDawn)} sub="Sun -12° to -6°" />
                        <PhaseTile accent="clay" label="Civil dawn" time={formatTime(selectedSunTimes.civilDawn)} sub="Sun -6° to 0°" />
                        <PhaseTile accent="ember" label="Golden hour" time={formatTime(selectedSunTimes.goldenHourMorning.start)} sub={`to ${formatTime(selectedSunTimes.goldenHourMorning.end)}`} />
                      </>
                    ) : (
                      <>
                        <PhaseTile accent="ember" label="Golden hour" time={formatTime(selectedSunTimes.goldenHourEvening.start)} sub={`to ${formatTime(selectedSunTimes.goldenHourEvening.end)}`} />
                        <PhaseTile accent="clay" label="Civil twilight" time={formatTime(selectedSunTimes.sunset)} sub={`to ${formatTime(selectedSunTimes.civilDusk)}`} />
                        <PhaseTile accent="water" label="Nautical twilight" time={formatTime(selectedSunTimes.civilDusk)} sub={`to ${formatTime(selectedSunTimes.nauticalDusk)}`} />
                        <PhaseTile accent="pine" label="Astronomical" time={formatTime(selectedSunTimes.nauticalDusk)} sub={`to ${formatTime(selectedSunTimes.astronomicalDusk)}`} />
                      </>
                    )}
                  </div>
                </div>

                {/* Blue hour */}
                <div className="mt-4 px-3.5 py-3 rounded-[10px] border border-water/30 bg-water/[0.08]">
                  <Mono className="text-water inline-flex items-center gap-1.5">
                    <Moon className="w-3 h-3" weight="regular" />
                    Blue hour ({activeTab === 'sunrise' ? 'morning' : 'evening'})
                  </Mono>
                  <p className="text-[13px] text-ink mt-1">
                    {activeTab === 'sunrise'
                      ? `${formatTime(selectedSunTimes.blueHourMorning.start)} – ${formatTime(selectedSunTimes.blueHourMorning.end)}`
                      : `${formatTime(selectedSunTimes.blueHourEvening.start)} – ${formatTime(selectedSunTimes.blueHourEvening.end)}`}
                  </p>
                  <p className="text-[12px] text-ink-3 mt-0.5">Best for moody, cool-toned photos.</p>
                </div>
              </div>
            )}

            {/* Terrain visibility */}
            {location && selectedSunTimes && (
              <div className="bg-white border border-line rounded-[14px] p-5">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <Mono className="text-sage inline-flex items-center gap-1.5">
                    <MountainsIcon className="w-3.5 h-3.5" weight="regular" />
                    {activeTab === 'sunrise' ? 'Sunrise' : 'Sunset'} terrain visibility
                  </Mono>
                  <Mono className="text-ink-3">
                    {formatAzimuth(activeTab === 'sunrise' ? selectedSunTimes.sunriseAzimuth : selectedSunTimes.sunsetAzimuth)}
                  </Mono>
                </div>

                {horizonLoading && (
                  <div className="flex items-center gap-2 text-ink-3 py-2">
                    <ArrowsClockwise className="w-4 h-4 animate-spin" />
                    <Mono>Analyzing terrain along {activeTab} azimuth…</Mono>
                  </div>
                )}

                {horizonError && (
                  <div className="px-3 py-2.5 rounded-[10px] border border-ember/30 bg-ember/[0.06]">
                    <p className="text-[13px] text-ember leading-[1.5]">{horizonError}</p>
                  </div>
                )}

                {horizonProfile && !horizonLoading && (
                  <div className="space-y-4">
                    {/* Quality assessment */}
                    <HorizonQualityCard horizonProfile={horizonProfile} />

                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <ImpactStat label="Effective horizon" value={`${horizonProfile.effectiveHorizon.toFixed(1)}°`} />
                      <ImpactStat label="Sunset lost" value={`~${horizonProfile.sunsetLostMinutes} min`} />
                      <ImpactStat
                        label="Golden hour"
                        value={`${Math.round(horizonProfile.goldenHourVisible)}%`}
                        sub="visible"
                      />
                      <ImpactStat label="Your elevation" value={`${Math.round(horizonProfile.observerElevation)} m`} />
                    </div>

                    {/* Horizon profile SVG visualization */}
                    <div>
                      <Mono className="text-ink-3 mb-2 block">
                        Terrain profile looking {formatAzimuth(horizonProfile.azimuth)}
                      </Mono>
                      <div className="h-32 bg-gradient-to-b from-clay/30 via-clay/15 to-cream rounded-[12px] relative overflow-hidden border border-line">
                        <div className="absolute right-3 top-2 flex flex-col gap-1">
                          <div className="inline-flex items-center gap-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-clay" />
                            <Mono className="text-clay">6° (30 min before)</Mono>
                          </div>
                          <div className="inline-flex items-center gap-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-ember" />
                            <Mono className="text-ember">0° (sunset)</Mono>
                          </div>
                        </div>
                        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <rect x="0" y="20" width="100" height="30" fill="rgba(176, 136, 90, 0.18)" />
                          <path
                            d={`M 0 100 ${horizonProfile.points
                              .map((p, i) => {
                                const x = ((i + 1) / horizonProfile.points.length) * 100;
                                const y = 100 - (50 + p.angularElevation * 5);
                                return `L ${x} ${Math.max(0, Math.min(100, y))}`;
                              })
                              .join(' ')} L 100 100 Z`}
                            fill="rgba(58, 74, 42, 0.55)"
                            stroke="rgb(58, 74, 42)"
                            strokeWidth="0.5"
                          />
                          <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(176,80,40,0.6)" strokeWidth="1" />
                          <line x1="0" y1="20" x2="100" y2="20" stroke="rgba(176,136,90,0.55)" strokeDasharray="3,3" />
                        </svg>
                        <Mono className="absolute bottom-1 left-2 text-ink-3">You</Mono>
                        <Mono className="absolute bottom-1 right-2 text-ink-3">30 km</Mono>
                        <Mono className="absolute left-2 text-ember" style={{ top: '46%' }}>0°</Mono>
                        <Mono className="absolute left-2 text-clay" style={{ top: '16%' }}>6°</Mono>
                      </div>
                    </div>

                    {/* Sample points */}
                    <details className="group">
                      <summary className="cursor-pointer inline-flex items-center gap-1.5 select-none">
                        <Mono className="text-ink-3 group-hover:text-ink transition-colors">
                          View terrain sample points
                        </Mono>
                      </summary>
                      <div className="mt-3 grid grid-cols-3 gap-1.5">
                        {horizonProfile.points.map((p, i) => (
                          <div key={i} className="px-2 py-1.5 bg-cream border border-line rounded-[8px] text-center">
                            <p className="text-[11px] font-sans font-semibold text-ink">{p.distance.toFixed(1)} km</p>
                            <Mono className="text-ink-3 block">{Math.round(p.elevation)} m</Mono>
                            <span
                              className={cn(
                                'text-[10px] font-mono font-semibold uppercase tracking-[0.06em]',
                                p.angularElevation > 0 ? 'text-clay' : 'text-pine-6',
                              )}
                            >
                              {p.angularElevation.toFixed(2)}°
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}

            {/* Empty state when no location */}
            {!location && !previewMode && (
              <div className="bg-white border border-line rounded-[14px] py-12 px-6 flex flex-col items-center text-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-clay/15 text-clay mb-3">
                  <Sparkle className="w-6 h-6" weight="regular" />
                </div>
                <Mono className="text-clay block">Choose a location</Mono>
                <p className="text-[14px] text-ink-3 mt-2 max-w-xs">
                  Search for a place above to see sunset and sunrise photography conditions.
                </p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// ====== Helpers ======

const TabButton = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={cn(
      'flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-4 rounded-full text-[12px] font-sans font-semibold tracking-[0.01em] transition-colors',
      active ? 'bg-ink text-cream shadow-[0_1px_2px_rgba(29,34,24,.08)]' : 'text-ink-3 hover:text-ink',
    )}
  >
    {children}
  </button>
);

const TimeBlock = ({
  label,
  value,
  accent,
  align = 'left',
}: {
  label: string;
  value: string;
  accent?: 'pine';
  align?: 'left' | 'center' | 'right';
}) => (
  <div className={cn(align === 'center' && 'text-center', align === 'right' && 'text-right')}>
    <Mono className={cn('block', accent === 'pine' ? 'text-pine-6' : 'text-ink-3')}>{label}</Mono>
    <p
      className={cn(
        'text-[15px] font-sans font-bold tracking-[-0.005em] mt-0.5',
        accent === 'pine' ? 'text-pine-6' : 'text-ink',
      )}
    >
      {value}
    </p>
  </div>
);

const CloudTile = ({
  label,
  value,
  good,
  warn,
  bad,
}: {
  label: string;
  value: number;
  good?: boolean;
  warn?: boolean;
  bad?: boolean;
}) => {
  const tone = good ? 'text-pine-6' : bad ? 'text-ember' : warn ? 'text-clay' : 'text-ink';
  return (
    <div className="px-3 py-2.5 rounded-[10px] bg-cream border border-line text-center">
      <Mono className="text-ink-3 block">{label}</Mono>
      <p className={cn('text-[18px] font-sans font-bold tracking-[-0.01em] mt-0.5', tone)}>
        {Math.round(value)}%
      </p>
    </div>
  );
};

const AtmoTile = ({
  Icon,
  label,
  value,
}: {
  Icon: typeof Eye;
  label: string;
  value: string;
}) => (
  <div className="flex items-center justify-between px-3 py-2.5 rounded-[10px] bg-cream border border-line">
    <div className="inline-flex items-center gap-1.5 min-w-0">
      <Icon className="w-3.5 h-3.5 text-ink-3 shrink-0" weight="regular" />
      <Mono className="text-ink-3 truncate">{label}</Mono>
    </div>
    <span className="text-[13px] font-sans font-semibold tracking-[-0.005em] text-ink shrink-0">{value}</span>
  </div>
);

const SunBlock = ({
  Icon,
  label,
  time,
  azimuth,
  active,
}: {
  Icon: typeof SunDim;
  label: string;
  time: string;
  azimuth?: string;
  active?: boolean;
}) => (
  <div
    className={cn(
      'rounded-[12px] border p-3.5 transition-all',
      active ? 'bg-clay/[0.06] border-clay/40' : 'bg-cream border-line',
    )}
  >
    <Mono className={cn('inline-flex items-center gap-1.5', active ? 'text-clay' : 'text-ink-3')}>
      <Icon className="w-3 h-3" weight="regular" />
      {label}
    </Mono>
    <p className="text-[22px] font-sans font-bold tracking-[-0.015em] text-ink mt-1 leading-none">{time}</p>
    {azimuth && (
      <div className="mt-1.5 inline-flex items-center gap-1">
        <Compass className="w-3 h-3 text-ink-3" weight="regular" />
        <Mono className="text-ink-3">{azimuth}</Mono>
      </div>
    )}
  </div>
);

const PhaseTile = ({
  accent,
  label,
  time,
  sub,
}: {
  accent: 'pine' | 'water' | 'clay' | 'ember';
  label: string;
  time: string;
  sub: string;
}) => {
  const tones: Record<typeof accent, { bg: string; border: string; text: string }> = {
    pine:  { bg: 'bg-pine-6/[0.06]', border: 'border-pine-6/30', text: 'text-pine-6' },
    water: { bg: 'bg-water/[0.06]',  border: 'border-water/30',  text: 'text-water' },
    clay:  { bg: 'bg-clay/[0.06]',   border: 'border-clay/30',   text: 'text-clay' },
    ember: { bg: 'bg-ember/[0.06]',  border: 'border-ember/30',  text: 'text-ember' },
  };
  const t = tones[accent];
  return (
    <div className={cn('px-3 py-2.5 rounded-[10px] border', t.bg, t.border)}>
      <Mono className={t.text}>{label}</Mono>
      <p className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink mt-0.5">{time}</p>
      <Mono className="text-ink-3 mt-0.5 block">{sub}</Mono>
    </div>
  );
};

const ImpactStat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="px-3 py-2.5 rounded-[10px] bg-cream border border-line text-center">
    <Mono className="text-ink-3 block">{label}</Mono>
    <p className="text-[18px] font-sans font-bold tracking-[-0.01em] text-ink mt-0.5 leading-none">{value}</p>
    {sub && <Mono className="text-ink-3 mt-1 block">{sub}</Mono>}
  </div>
);

const HORIZON_QUALITY_TONES: Record<
  string,
  { bg: string; border: string; chip: string }
> = {
  clear:       { bg: 'bg-pine-6/[0.06]', border: 'border-pine-6/30', chip: 'bg-pine-6 text-cream' },
  minimal:     { bg: 'bg-pine-6/[0.06]', border: 'border-pine-6/30', chip: 'bg-pine-6 text-cream' },
  low:         { bg: 'bg-water/[0.06]',  border: 'border-water/30',  chip: 'bg-water text-cream' },
  moderate:    { bg: 'bg-clay/[0.06]',   border: 'border-clay/30',   chip: 'bg-clay text-cream' },
  significant: { bg: 'bg-ember/[0.06]',  border: 'border-ember/30',  chip: 'bg-ember text-cream' },
  blocked:     { bg: 'bg-ember/[0.10]',  border: 'border-ember/40',  chip: 'bg-ember text-cream' },
};

const HorizonQualityCard = ({ horizonProfile }: { horizonProfile: HorizonProfile }) => {
  const tone = HORIZON_QUALITY_TONES[horizonProfile.quality] || HORIZON_QUALITY_TONES.clear;
  return (
    <div className={cn('px-4 py-3.5 rounded-[12px] border', tone.bg, tone.border)}>
      <div className="flex items-start gap-3">
        <div className={cn('w-11 h-11 rounded-[10px] flex items-center justify-center font-sans font-bold text-[13px] shrink-0', tone.chip)}>
          {horizonProfile.effectiveHorizon.toFixed(0)}°
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">
            {horizonProfile.qualityLabel}
          </p>
          <p className="text-[12px] text-ink-3 mt-0.5 leading-[1.5]">{horizonProfile.qualityDescription}</p>
        </div>
      </div>
    </div>
  );
};

const TERRAIN_FEATURE_TONES: Record<string, string> = {
  cliff:  'bg-ember/15 text-ember',
  ridge:  'bg-pine-6/12 text-pine-6',
  peak:   'bg-water/15 text-water',
  slope:  'bg-sage/15 text-sage',
  default: 'bg-cream text-ink-3',
};

const TerrainFeatureRow = ({ feature }: { feature: TerrainFeature }) => {
  const featureTone = TERRAIN_FEATURE_TONES[feature.featureType] || TERRAIN_FEATURE_TONES.default;
  const scoreTone =
    feature.score >= 75 ? 'bg-pine-6 text-cream' : feature.score >= 60 ? 'bg-clay text-cream' : 'bg-ink-3 text-cream';
  const accessTone = feature.accessible
    ? feature.accessType === 'road'
      ? 'bg-pine-6/12 text-pine-6'
      : feature.accessType === 'track'
        ? 'bg-sage/15 text-sage'
        : 'bg-water/15 text-water'
    : 'bg-ember/15 text-ember';

  return (
    <div className="px-3.5 py-3 rounded-[12px] bg-cream border border-line">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-[0.10em] font-semibold', featureTone)}>
              {feature.featureType}
            </span>
            <span className="text-[13px] font-sans font-semibold tracking-[-0.005em] text-ink">
              {feature.aspectLabel}
            </span>
            {feature.curvature === 'convex' && (
              <Mono className="text-clay">Convex</Mono>
            )}
            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-[0.10em] font-semibold', accessTone)}>
              {feature.accessible ? `${feature.accessType} ${feature.accessDistance}m` : 'No access'}
            </span>
          </div>

          <div className="text-[12px] text-ink-3 mt-1.5 inline-flex items-center gap-1.5 flex-wrap">
            <span>{feature.distanceKm.toFixed(1)} km {feature.bearingLabel}</span>
            <span className="text-line">·</span>
            <span>{Math.round(feature.elevation)} m</span>
            <span className="text-line">·</span>
            <span>{feature.slopeCategory} ({Math.round(feature.slope)}°)</span>
            <span className="text-line">·</span>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${feature.lat},${feature.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-pine-6 hover:underline"
            >
              Map
            </a>
          </div>

          <p className="text-[13px] text-ink mt-2 leading-[1.5]">{feature.recommendation}</p>
          <Mono className="text-clay mt-1 inline-flex items-center gap-1">
            <Sparkle className="w-3 h-3" weight="regular" />
            {feature.lightingWindow}
          </Mono>
        </div>

        <div className={cn('px-2.5 py-1 rounded-full text-[12px] font-sans font-bold tracking-[-0.005em] shrink-0', scoreTone)}>
          {feature.score}
        </div>
      </div>
    </div>
  );
};

// Re-export for compatibility (in case anything imports it)
export { WMO_CODES };
