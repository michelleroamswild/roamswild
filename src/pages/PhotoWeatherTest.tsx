import { useState, useEffect, useMemo } from 'react';
import { Camera, Sun, SunHorizon, CloudSun, ArrowsClockwise, Compass, Moon, Mountains, SunDim, Star, Check, X, Question } from '@phosphor-icons/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlaceSearch } from '@/components/PlaceSearch';
import { Header } from '@/components/Header';
import { formatTime, getSunTimes, formatAzimuth, SunTimes } from '@/utils/sunCalc';
import { analyzeHorizonProfile, getElevation, HorizonProfile } from '@/utils/terrainVisibility';
import { analyzePhotoConditions, PhotoForecast, OpenMeteoHourly } from '@/utils/photoConditionsAnalyzer';

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

interface SelectedLocation {
  name: string;
  lat: number;
  lng: number;
}

// Open-Meteo response types
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

// WMO Weather interpretation codes
const WMO_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

function getWeatherDescription(code: number): string {
  return WMO_CODES[code] || `Unknown (${code})`;
}

// Helper to get quality icon for a forecast
function getQualityIcon(forecast: PhotoForecast | null, size: number = 16) {
  if (!forecast) return <Question className="text-gray-400" style={{ width: size, height: size }} />;
  switch (forecast.overall) {
    case 'excellent':
      return <Star weight="fill" className="text-green-500" style={{ width: size, height: size }} />;
    case 'good':
      return <Check weight="bold" className="text-blue-500" style={{ width: size, height: size }} />;
    case 'fair':
      return <Sun className="text-amber-500" style={{ width: size, height: size }} />;
    case 'poor':
      return <X weight="bold" className="text-red-400" style={{ width: size, height: size }} />;
  }
}

// Helper to get quality color class
function getQualityColor(overall: string | undefined): string {
  switch (overall) {
    case 'excellent': return 'bg-green-100 border-green-300 text-green-800';
    case 'good': return 'bg-blue-100 border-blue-300 text-blue-800';
    case 'fair': return 'bg-amber-100 border-amber-300 text-amber-800';
    case 'poor': return 'bg-red-100 border-red-300 text-red-800';
    default: return 'bg-gray-100 border-gray-300 text-gray-600';
  }
}

export default function PhotoWeatherTest() {
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [openMeteoData, setOpenMeteoData] = useState<OpenMeteoResponse | null>(null);
  const [openMeteoLoading, setOpenMeteoLoading] = useState(false);
  const [openMeteoError, setOpenMeteoError] = useState<string | null>(null);
  const [horizonProfile, setHorizonProfile] = useState<HorizonProfile | null>(null);
  const [horizonLoading, setHorizonLoading] = useState(false);
  const [horizonError, setHorizonError] = useState<string | null>(null);
  const [photoForecast, setPhotoForecast] = useState<PhotoForecast | null>(null);
  const [activeTab, setActiveTab] = useState<SunEventType>('sunset');
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  // Fetch Open-Meteo data when location changes
  useEffect(() => {
    if (!location) return;

    const fetchOpenMeteo = async () => {
      setOpenMeteoLoading(true);
      setOpenMeteoError(null);

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
          }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        setOpenMeteoData(data);
      } catch (err) {
        console.error('Open-Meteo fetch error:', err);
        setOpenMeteoError(err instanceof Error ? err.message : 'Failed to fetch');
      } finally {
        setOpenMeteoLoading(false);
      }
    };

    fetchOpenMeteo();
  }, [location]);

  // Calculate sun times using SunCalc (moved up so we can use it for horizon analysis)
  const sunTimes = useMemo(() => {
    if (!location) return null;
    return getSunTimes(location.lat, location.lng, new Date());
  }, [location]);

  // Calculate multi-day forecast (7 days)
  const multiDayForecast = useMemo((): DayForecast[] => {
    if (!location || !openMeteoData?.hourly?.time) return [];

    const forecasts: DayForecast[] = [];
    const now = new Date();

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = new Date(now);
      date.setDate(date.getDate() + dayOffset);
      date.setHours(12, 0, 0, 0); // Noon of that day

      const dayTimes = getSunTimes(location.lat, location.lng, date);
      const dateStr = date.toDateString();

      // Find hourly indices for sunrise and sunset
      let sunriseIndex: number | null = null;
      let sunsetIndex: number | null = null;

      const sunriseHour = dayTimes.sunrise.getHours();
      const sunsetHour = dayTimes.sunset.getHours();

      openMeteoData.hourly.time.forEach((t, i) => {
        const d = new Date(t);
        if (d.toDateString() === dateStr) {
          if (d.getHours() === sunriseHour) sunriseIndex = i;
          if (d.getHours() === sunsetHour) sunsetIndex = i;
        }
      });

      // Analyze conditions for sunrise and sunset
      let sunriseForecast: PhotoForecast | null = null;
      let sunsetForecast: PhotoForecast | null = null;

      if (sunriseIndex !== null && openMeteoData.hourly) {
        sunriseForecast = analyzePhotoConditions(
          openMeteoData.hourly as OpenMeteoHourly,
          sunriseIndex,
          undefined // No terrain analysis for multi-day quick view
        );
      }

      if (sunsetIndex !== null && openMeteoData.hourly) {
        sunsetForecast = analyzePhotoConditions(
          openMeteoData.hourly as OpenMeteoHourly,
          sunsetIndex,
          undefined
        );
      }

      // Create date label
      let dateLabel: string;
      if (dayOffset === 0) {
        dateLabel = 'Today';
      } else if (dayOffset === 1) {
        dateLabel = 'Tomorrow';
      } else {
        dateLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      }

      forecasts.push({
        date,
        dateLabel,
        sunTimes: dayTimes,
        sunriseIndex,
        sunsetIndex,
        sunriseForecast,
        sunsetForecast,
      });
    }

    return forecasts;
  }, [location, openMeteoData]);

  // Determine which day to show based on whether we've passed the event
  const getEffectiveDayIndex = useMemo(() => {
    if (multiDayForecast.length === 0) return 0;

    const now = new Date();
    const todayForecast = multiDayForecast[0];

    if (activeTab === 'sunrise') {
      // If past today's sunrise, default to tomorrow
      if (now > todayForecast.sunTimes.sunrise) {
        return selectedDayIndex === 0 ? 1 : selectedDayIndex;
      }
    } else {
      // If past today's sunset, default to tomorrow
      if (now > todayForecast.sunTimes.sunset) {
        return selectedDayIndex === 0 ? 1 : selectedDayIndex;
      }
    }

    return selectedDayIndex;
  }, [multiDayForecast, activeTab, selectedDayIndex]);

  // Get the selected day's forecast
  const selectedDayForecast = multiDayForecast[getEffectiveDayIndex] || null;
  const selectedSunTimes = selectedDayForecast?.sunTimes || sunTimes;

  // Fetch horizon profile when location and selected sun times are available
  useEffect(() => {
    if (!location || !selectedSunTimes) return;

    const fetchHorizonProfile = async () => {
      setHorizonLoading(true);
      setHorizonError(null);

      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        // First get observer elevation
        const observerElevation = await getElevation(
          location.lat,
          location.lng,
          supabaseUrl,
          anonKey
        );

        // Analyze horizon along the appropriate azimuth (sunrise or sunset)
        const azimuth = activeTab === 'sunrise'
          ? selectedSunTimes.sunriseAzimuth
          : selectedSunTimes.sunsetAzimuth;

        const profile = await analyzeHorizonProfile(
          location.lat,
          location.lng,
          observerElevation,
          azimuth,
          0, // sun altitude at horizon
          supabaseUrl,
          anonKey,
          30, // check 30km out
          15  // 15 sample points
        );

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

  const handlePlaceSelect = (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location) {
      setLocation({
        name: place.name || place.formatted_address || 'Selected Location',
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      });
    }
  };

  // Get the hourly index for the selected day's event (sunrise or sunset)
  const selectedEventIndex = useMemo(() => {
    if (!selectedDayForecast) return null;
    return activeTab === 'sunrise'
      ? selectedDayForecast.sunriseIndex
      : selectedDayForecast.sunsetIndex;
  }, [selectedDayForecast, activeTab]);

  // Compute photo forecast for the selected day/event with terrain analysis
  useEffect(() => {
    if (!openMeteoData?.hourly || selectedEventIndex === null || selectedEventIndex < 0) {
      setPhotoForecast(null);
      return;
    }

    const forecast = analyzePhotoConditions(
      openMeteoData.hourly as OpenMeteoHourly,
      selectedEventIndex,
      horizonProfile ?? undefined
    );
    setPhotoForecast(forecast);
  }, [openMeteoData, selectedEventIndex, horizonProfile]);

  // Calculate recommended shoot window based on conditions
  const getShootWindow = useMemo(() => {
    if (!selectedSunTimes || !photoForecast) return null;

    const isSunrise = activeTab === 'sunrise';

    // For sunrise: use morning golden hour and civil dawn
    // For sunset: use evening golden hour and civil dusk
    const goldenStart = isSunrise
      ? new Date(selectedSunTimes.goldenHourMorning.start)
      : new Date(selectedSunTimes.goldenHourEvening.start);
    const sunEvent = isSunrise
      ? new Date(selectedSunTimes.sunrise)
      : new Date(selectedSunTimes.sunset);
    const twilightEnd = isSunrise
      ? new Date(selectedSunTimes.goldenHourMorning.end)
      : new Date(selectedSunTimes.civilDusk);

    // Default window
    let windowStart = goldenStart;
    let windowEnd = twilightEnd;

    // Peak times differ for sunrise vs sunset
    let peakStart: Date;
    let peakEnd: Date;

    if (isSunrise) {
      // For sunrise: peak is around sunrise time
      peakStart = new Date(sunEvent.getTime() - 15 * 60000); // 15 min before sunrise
      peakEnd = new Date(sunEvent.getTime() + 20 * 60000); // 20 min after
    } else {
      // For sunset: peak is around sunset time
      peakStart = new Date(sunEvent.getTime() - 20 * 60000); // 20 min before sunset
      peakEnd = new Date(sunEvent.getTime() + 15 * 60000); // 15 min after
    }

    let afterglowEnd: Date | null = null;

    // High clouds extend the afterglow window (colors persist 15-30 min)
    const hasHighClouds = photoForecast.cloudAnalysis.high >= 20;
    if (hasHighClouds && !isSunrise) {
      afterglowEnd = new Date(sunEvent.getTime() + 30 * 60000); // 30 min afterglow
      windowEnd = new Date(Math.max(twilightEnd.getTime(), afterglowEnd.getTime()));
    }

    // Adjust based on conditions
    if (photoForecast.timing.recommendation === 'shoot-early') {
      windowEnd = new Date(sunEvent.getTime() + 5 * 60000);
      peakStart = new Date(sunEvent.getTime() - 30 * 60000);
      peakEnd = sunEvent;
      afterglowEnd = null;
    } else if (photoForecast.timing.recommendation === 'stay-after' && !isSunrise) {
      windowStart = new Date(sunEvent.getTime() - 15 * 60000);
      windowEnd = new Date(twilightEnd.getTime() + 15 * 60000);
      peakStart = new Date(sunEvent.getTime() + 5 * 60000);
      peakEnd = new Date(sunEvent.getTime() + 25 * 60000);
      afterglowEnd = new Date(sunEvent.getTime() + 30 * 60000);
    }

    // If terrain blocks low sun, shift window
    if (horizonProfile && horizonProfile.effectiveHorizon > 4) {
      const minutesLost = horizonProfile.sunsetLostMinutes;
      if (isSunrise) {
        // For sunrise, terrain delays when you first see sun
        peakStart = new Date(peakStart.getTime() + minutesLost * 60000);
        peakEnd = new Date(peakEnd.getTime() + Math.floor(minutesLost / 2) * 60000);
      } else {
        // For sunset, terrain causes earlier loss of sun
        windowStart = new Date(goldenStart.getTime() - 10 * 60000);
        peakStart = new Date(peakStart.getTime() - minutesLost * 60000);
        peakEnd = new Date(peakEnd.getTime() - Math.floor(minutesLost / 2) * 60000);
      }
    }

    // If low clouds block horizon, focus on higher sun
    if (photoForecast.cloudAnalysis.low > 50) {
      if (isSunrise) {
        peakStart = new Date(sunEvent.getTime() + 20 * 60000);
        windowEnd = new Date(twilightEnd.getTime() + 15 * 60000);
      } else {
        windowStart = new Date(goldenStart.getTime() - 15 * 60000);
        peakStart = new Date(sunEvent.getTime() - 40 * 60000);
      }
    }

    return {
      windowStart,
      windowEnd,
      peakStart,
      peakEnd,
      afterglowEnd,
      hasHighClouds,
      isSunrise,
      duration: Math.round((windowEnd.getTime() - windowStart.getTime()) / 60000),
    };
  }, [selectedSunTimes, photoForecast, horizonProfile, activeTab]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
          <Camera className="w-6 h-6 text-primary" />
          Photo Weather Test
        </h1>

        {/* Location Search */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Search Location</CardTitle>
          </CardHeader>
          <CardContent>
            <PlaceSearch
              onPlaceSelect={handlePlaceSelect}
              placeholder="Enter a location..."
            />
            {location && (
              <p className="mt-3 text-sm text-muted-foreground">
                Selected: {location.name} ({location.lat.toFixed(4)}, {location.lng.toFixed(4)})
              </p>
            )}
          </CardContent>
        </Card>

        {/* Sunrise/Sunset Tabs */}
        {location && (
          <div className="mb-6">
            {/* Tab Buttons */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => { setActiveTab('sunrise'); setSelectedDayIndex(0); }}
                className={`flex-1 py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'sunrise'
                    ? 'bg-gradient-to-r from-orange-400 to-amber-400 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <SunDim className="w-5 h-5" />
                Sunrise
              </button>
              <button
                onClick={() => { setActiveTab('sunset'); setSelectedDayIndex(0); }}
                className={`flex-1 py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'sunset'
                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <SunHorizon className="w-5 h-5" />
                Sunset
              </button>
            </div>

            {/* Multi-Day Forecast Bar */}
            {multiDayForecast.length > 0 && (
              <div className="bg-white rounded-lg border p-3">
                <div className="text-xs text-muted-foreground mb-2 font-medium">
                  7-Day {activeTab === 'sunrise' ? 'Sunrise' : 'Sunset'} Forecast
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {multiDayForecast.map((day, index) => {
                    const forecast = activeTab === 'sunrise' ? day.sunriseForecast : day.sunsetForecast;
                    const isSelected = index === getEffectiveDayIndex;
                    const isPast = activeTab === 'sunrise'
                      ? new Date() > day.sunTimes.sunrise && index === 0
                      : new Date() > day.sunTimes.sunset && index === 0;

                    return (
                      <button
                        key={index}
                        onClick={() => setSelectedDayIndex(index)}
                        disabled={isPast}
                        className={`p-2 rounded-lg text-center transition-all ${
                          isSelected
                            ? 'bg-primary text-white ring-2 ring-primary ring-offset-1'
                            : isPast
                            ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                            : 'bg-gray-50 hover:bg-gray-100 cursor-pointer'
                        }`}
                      >
                        <div className="text-xs font-medium truncate">
                          {day.dateLabel}
                        </div>
                        <div className="flex justify-center my-1">
                          {getQualityIcon(forecast, 20)}
                        </div>
                        <div className={`text-xs ${isSelected ? 'text-white/80' : 'text-muted-foreground'}`}>
                          {formatTime(activeTab === 'sunrise' ? day.sunTimes.sunrise : day.sunTimes.sunset)}
                        </div>
                        {forecast && (
                          <div className={`text-[10px] font-medium mt-0.5 ${
                            isSelected ? 'text-white/90' :
                            forecast.overall === 'excellent' ? 'text-green-600' :
                            forecast.overall === 'good' ? 'text-blue-600' :
                            forecast.overall === 'fair' ? 'text-amber-600' :
                            'text-gray-500'
                          }`}>
                            {forecast.overall}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PHOTOGRAPHY FORECAST - Main Card */}
        {photoForecast && selectedSunTimes && (
          <Card className={`mb-6 border-2 ${
            photoForecast.overall === 'excellent' ? 'border-green-400 bg-gradient-to-br from-green-50 to-emerald-50' :
            photoForecast.overall === 'good' ? 'border-blue-400 bg-gradient-to-br from-blue-50 to-sky-50' :
            photoForecast.overall === 'fair' ? 'border-amber-400 bg-gradient-to-br from-amber-50 to-yellow-50' :
            'border-gray-400 bg-gradient-to-br from-gray-50 to-slate-50'
          }`}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {activeTab === 'sunrise' ? (
                      <SunDim className="w-6 h-6 text-orange-500" />
                    ) : (
                      <SunHorizon className="w-6 h-6 text-orange-600" />
                    )}
                    {activeTab === 'sunrise' ? 'Sunrise' : 'Sunset'} Photography Forecast
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedDayForecast?.dateLabel || 'Today'} •{' '}
                    {formatTime(activeTab === 'sunrise' ? selectedSunTimes.sunrise : selectedSunTimes.sunset)} •{' '}
                    {formatAzimuth(activeTab === 'sunrise' ? selectedSunTimes.sunriseAzimuth : selectedSunTimes.sunsetAzimuth)}
                  </p>
                </div>
                <div className={`px-4 py-2 rounded-full text-white font-bold ${
                  photoForecast.overall === 'excellent' ? 'bg-green-500' :
                  photoForecast.overall === 'good' ? 'bg-blue-500' :
                  photoForecast.overall === 'fair' ? 'bg-amber-500' :
                  'bg-gray-500'
                }`}>
                  {photoForecast.overall.toUpperCase()}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Headline */}
              <div className="text-lg font-medium">
                {photoForecast.headline}
              </div>

              {/* Shoot Window Recommendation */}
              {getShootWindow && (
                <div className="p-4 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-200">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">📸</span>
                    <span className="font-semibold">Recommended Shoot Window</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      ~{getShootWindow.duration} min
                    </span>
                  </div>

                  {/* Timeline visualization */}
                  <div className="relative h-8 bg-gradient-to-r from-amber-200 via-orange-300 to-purple-300 rounded-full mb-3 overflow-hidden">
                    {/* Peak window highlight */}
                    <div
                      className="absolute h-full bg-green-400/60 border-x-2 border-green-600"
                      style={{
                        left: `${((getShootWindow.peakStart.getTime() - getShootWindow.windowStart.getTime()) / (getShootWindow.windowEnd.getTime() - getShootWindow.windowStart.getTime())) * 100}%`,
                        width: `${((getShootWindow.peakEnd.getTime() - getShootWindow.peakStart.getTime()) / (getShootWindow.windowEnd.getTime() - getShootWindow.windowStart.getTime())) * 100}%`,
                      }}
                    />
                    {/* Sun event marker */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-600"
                      style={{
                        left: `${(((activeTab === 'sunrise' ? selectedSunTimes.sunrise : selectedSunTimes.sunset).getTime() - getShootWindow.windowStart.getTime()) / (getShootWindow.windowEnd.getTime() - getShootWindow.windowStart.getTime())) * 100}%`,
                      }}
                    />
                  </div>

                  {/* Times */}
                  <div className="grid grid-cols-3 text-xs">
                    <div>
                      <div className="text-muted-foreground">Arrive by</div>
                      <div className="font-bold text-base">{formatTime(getShootWindow.windowStart)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-green-700 font-medium">Peak Color</div>
                      <div className="font-bold text-base text-green-800">
                        {formatTime(getShootWindow.peakStart)} - {formatTime(getShootWindow.peakEnd)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-muted-foreground">Pack up</div>
                      <div className="font-bold text-base">{formatTime(getShootWindow.windowEnd)}</div>
                    </div>
                  </div>

                  {/* Timing tips */}
                  <div className="mt-3 pt-2 border-t border-orange-200 text-xs space-y-1">
                    {photoForecast.timing.recommendation !== 'flexible' && (
                      <div className="text-orange-800">
                        💡 {photoForecast.timing.reason}
                      </div>
                    )}
                    {getShootWindow.hasHighClouds && getShootWindow.afterglowEnd && (
                      <div className="text-purple-700">
                        ✨ High clouds present — afterglow colors may persist until {formatTime(getShootWindow.afterglowEnd)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Cloud Analysis */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2 bg-white/60 rounded-lg">
                  <div className="text-xs text-muted-foreground">High</div>
                  <div className={`text-xl font-bold ${
                    photoForecast.cloudAnalysis.high >= 20 && photoForecast.cloudAnalysis.high <= 60
                      ? 'text-green-600' : 'text-gray-600'
                  }`}>
                    {photoForecast.cloudAnalysis.high}%
                  </div>
                  <div className="text-xs text-muted-foreground">&gt;6km</div>
                </div>
                <div className="p-2 bg-white/60 rounded-lg">
                  <div className="text-xs text-muted-foreground">Mid</div>
                  <div className={`text-xl font-bold ${
                    photoForecast.cloudAnalysis.mid >= 30 && photoForecast.cloudAnalysis.mid <= 50
                      ? 'text-blue-600' : 'text-gray-600'
                  }`}>
                    {photoForecast.cloudAnalysis.mid}%
                  </div>
                  <div className="text-xs text-muted-foreground">2-6km</div>
                </div>
                <div className="p-2 bg-white/60 rounded-lg">
                  <div className="text-xs text-muted-foreground">Low</div>
                  <div className={`text-xl font-bold ${
                    photoForecast.cloudAnalysis.low >= 60 ? 'text-red-600' :
                    photoForecast.cloudAnalysis.low >= 35 ? 'text-amber-600' :
                    photoForecast.cloudAnalysis.low >= 15 ? 'text-green-600' :
                    'text-gray-600'
                  }`}>
                    {photoForecast.cloudAnalysis.low}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {photoForecast.cloudAnalysis.low >= 15 && photoForecast.cloudAnalysis.low < 35
                      ? '🔥 drama'
                      : '<2km'}
                  </div>
                </div>
                <div className="p-2 bg-white/60 rounded-lg">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="text-xl font-bold text-gray-600">
                    {photoForecast.cloudAnalysis.total}%
                  </div>
                  <div className="text-xs text-muted-foreground">cover</div>
                </div>
              </div>

              {/* Cloud Trend */}
              {photoForecast.cloudAnalysis.trend.direction !== 'steady' && (
                <div className="flex items-center gap-2 text-sm">
                  <span className={photoForecast.cloudAnalysis.trend.direction === 'clearing' ? 'text-green-600' : 'text-amber-600'}>
                    {photoForecast.cloudAnalysis.trend.direction === 'clearing' ? '📈 Clearing:' : '📉 Building:'}
                  </span>
                  <span className="text-muted-foreground">{photoForecast.cloudAnalysis.trend.description}</span>
                </div>
              )}

              {/* Terrain Impact */}
              {photoForecast.terrain && photoForecast.terrain.effectiveHorizon > 0.5 && (
                <div className="p-3 bg-white/60 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Mountains className="w-4 h-4 text-green-700" />
                    <span className="font-medium text-sm">Terrain Impact</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {photoForecast.terrain.effectiveHorizon.toFixed(1)}° effective horizon •
                    {Math.round(photoForecast.terrain.goldenHourVisible)}% of golden hour visible •
                    {photoForecast.terrain.colorImpact}
                  </p>
                </div>
              )}

              {/* Why This Rating - Detailed Insights */}
              <div className="space-y-3">
                <div className="text-sm font-medium">Why {photoForecast.overall}?</div>

                {/* Positive factors */}
                {photoForecast.insights.filter(i => i.impact === 'excellent' || i.impact === 'good').length > 0 && (
                  <div className="space-y-1.5">
                    {photoForecast.insights
                      .filter(i => i.impact === 'excellent' || i.impact === 'good')
                      .slice(0, 4)
                      .map((insight, i) => (
                        <div
                          key={i}
                          className={`p-2 rounded-lg text-sm ${
                            insight.impact === 'excellent'
                              ? 'bg-green-50 border-l-4 border-green-500'
                              : 'bg-blue-50 border-l-4 border-blue-400'
                          }`}
                        >
                          <div className="font-medium flex items-center gap-1.5">
                            <span>{insight.impact === 'excellent' ? '✨' : '👍'}</span>
                            {insight.label}
                          </div>
                          <div className="text-muted-foreground text-xs mt-0.5">
                            {insight.description}
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Caution factors */}
                {photoForecast.insights.filter(i => i.impact === 'caution' || i.impact === 'poor').length > 0 && (
                  <div className="space-y-1.5">
                    {photoForecast.insights
                      .filter(i => i.impact === 'caution' || i.impact === 'poor')
                      .slice(0, 3)
                      .map((insight, i) => (
                        <div
                          key={i}
                          className={`p-2 rounded-lg text-sm ${
                            insight.impact === 'poor'
                              ? 'bg-red-50 border-l-4 border-red-400'
                              : 'bg-amber-50 border-l-4 border-amber-400'
                          }`}
                        >
                          <div className="font-medium flex items-center gap-1.5">
                            <span>{insight.impact === 'poor' ? '⚠️' : '⚡'}</span>
                            {insight.label}
                          </div>
                          <div className="text-muted-foreground text-xs mt-0.5">
                            {insight.description}
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Neutral insights as smaller pills */}
                {photoForecast.insights.filter(i => i.impact === 'neutral').length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {photoForecast.insights
                      .filter(i => i.impact === 'neutral')
                      .map((insight, i) => (
                        <div
                          key={i}
                          className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600"
                          title={insight.description}
                        >
                          {insight.label}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Atmospheric Conditions */}
              <div className="pt-3 border-t">
                <div className="text-sm font-medium mb-2">Atmospheric Conditions</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {/* Visibility */}
                  <div className="p-2 bg-white/60 rounded-lg">
                    <div className="text-muted-foreground mb-1">Visibility</div>
                    <div className="font-bold text-lg">
                      {photoForecast.atmosphere.visibility.toFixed(0)} km
                    </div>
                    <div className={`text-xs ${
                      photoForecast.atmosphere.visibilityRating === 'crisp' ? 'text-green-600' :
                      photoForecast.atmosphere.visibilityRating === 'atmospheric' ? 'text-blue-600' :
                      'text-amber-600'
                    }`}>
                      {photoForecast.atmosphere.visibilityRating === 'crisp' ? '✨ Crystal clear' :
                       photoForecast.atmosphere.visibilityRating === 'atmospheric' ? '🌫️ Soft atmosphere' :
                       '😶‍🌫️ Hazy'}
                    </div>
                  </div>

                  {/* Humidity */}
                  <div className="p-2 bg-white/60 rounded-lg">
                    <div className="text-muted-foreground mb-1">Humidity</div>
                    <div className="font-bold text-lg">
                      {photoForecast.atmosphere.humidity}%
                    </div>
                    <div className={`text-xs ${
                      photoForecast.atmosphere.humidity < 40 ? 'text-green-600' :
                      photoForecast.atmosphere.humidity > 80 ? 'text-blue-600' :
                      'text-gray-600'
                    }`}>
                      {photoForecast.atmosphere.humidityEffect}
                      {photoForecast.atmosphere.fogRisk && ' 🌁'}
                    </div>
                  </div>

                  {/* Wind */}
                  <div className="p-2 bg-white/60 rounded-lg">
                    <div className="text-muted-foreground mb-1">Wind</div>
                    <div className="font-bold text-lg">
                      {(photoForecast.wind.speed * 0.621).toFixed(0)} mph
                    </div>
                    <div className="text-xs">
                      {photoForecast.wind.reflectionsPossible ? (
                        <span className="text-blue-600">🪞 Mirror reflections</span>
                      ) : photoForecast.wind.tripodStable ? (
                        <span className="text-green-600">✓ Tripod stable</span>
                      ) : (
                        <span className="text-amber-600">⚠️ Gusty {(photoForecast.wind.gusts * 0.621).toFixed(0)} mph</span>
                      )}
                    </div>
                  </div>

                  {/* Precipitation */}
                  <div className="p-2 bg-white/60 rounded-lg">
                    <div className="text-muted-foreground mb-1">Precipitation</div>
                    <div className="font-bold text-lg">
                      {photoForecast.precipitation.probability}%
                    </div>
                    <div className="text-xs">
                      {photoForecast.precipitation.postStormPotential ? (
                        <span className="text-green-600">✨ Post-storm glow!</span>
                      ) : photoForecast.precipitation.isClearing ? (
                        <span className="text-blue-600">🌤️ Clearing</span>
                      ) : photoForecast.precipitation.probability > 50 ? (
                        <span className="text-amber-600">☔ Rain likely</span>
                      ) : (
                        <span className="text-gray-600">Dry conditions</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Fog/Mist Alert */}
                {photoForecast.atmosphere.fogRisk && (
                  <div className="mt-2 p-2 bg-blue-50 rounded-lg text-xs text-blue-800 flex items-center gap-2">
                    <span>🌁</span>
                    <span>Temperature near dew point — fog or mist may form, creating moody atmosphere</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading state for photo forecast */}
        {location && !photoForecast && (openMeteoLoading || horizonLoading) && (
          <Card className="mb-6">
            <CardContent className="py-8 text-center text-muted-foreground flex items-center justify-center gap-2">
              <ArrowsClockwise className="w-5 h-5 animate-spin" />
              Analyzing photography conditions...
            </CardContent>
          </Card>
        )}

        {/* Sun Position & Twilight Card - Full Width */}
        {location && selectedSunTimes && (
          <Card className="mb-6 border-amber-200">
            <CardHeader className="pb-2 bg-amber-50">
              <CardTitle className="text-base flex items-center gap-2">
                <Sun className="w-5 h-5 text-amber-500" />
                Sun Position & Twilight
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  {selectedDayForecast?.dateLabel || 'Today'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid md:grid-cols-3 gap-6">
                {/* Sunrise Info */}
                <div className={`space-y-2 p-3 rounded-lg ${activeTab === 'sunrise' ? 'bg-orange-50 ring-2 ring-orange-300' : ''}`}>
                  <h3 className="font-medium text-sm flex items-center gap-2">
                    <SunDim className="w-4 h-4 text-orange-400" />
                    Sunrise
                  </h3>
                  <div className="text-2xl font-bold">{formatTime(selectedSunTimes.sunrise)}</div>
                  <div className="flex items-center gap-2 text-sm">
                    <Compass className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Azimuth:</span>
                    <span className="font-medium">{formatAzimuth(selectedSunTimes.sunriseAzimuth)}</span>
                  </div>
                </div>

                {/* Sunset Info */}
                <div className={`space-y-2 p-3 rounded-lg ${activeTab === 'sunset' ? 'bg-orange-50 ring-2 ring-orange-300' : ''}`}>
                  <h3 className="font-medium text-sm flex items-center gap-2">
                    <SunHorizon className="w-4 h-4 text-orange-500" />
                    Sunset
                  </h3>
                  <div className="text-2xl font-bold">{formatTime(selectedSunTimes.sunset)}</div>
                  <div className="flex items-center gap-2 text-sm">
                    <Compass className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Azimuth:</span>
                    <span className="font-medium">{formatAzimuth(selectedSunTimes.sunsetAzimuth)}</span>
                  </div>
                </div>

                {/* Solar Noon */}
                <div className="space-y-2 p-3">
                  <h3 className="font-medium text-sm flex items-center gap-2">
                    <Sun className="w-4 h-4 text-yellow-500" />
                    Solar Noon
                  </h3>
                  <div className="text-2xl font-bold">{formatTime(selectedSunTimes.solarNoon)}</div>
                </div>
              </div>

              {/* Twilight Times - show based on active tab */}
              <div className="mt-6 pt-4 border-t">
                <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <Moon className="w-4 h-4 text-indigo-400" />
                  {activeTab === 'sunrise' ? 'Morning Twilight Phases' : 'Evening Twilight Phases'}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {activeTab === 'sunrise' ? (
                    <>
                      <div className="p-3 bg-indigo-50 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Astronomical Dawn</div>
                        <div className="font-medium">{formatTime(selectedSunTimes.astronomicalDawn)}</div>
                        <div className="text-xs text-muted-foreground mt-1">Sun -18° to -12°</div>
                      </div>
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Nautical Dawn</div>
                        <div className="font-medium">{formatTime(selectedSunTimes.nauticalDawn)}</div>
                        <div className="text-xs text-muted-foreground mt-1">Sun -12° to -6°</div>
                      </div>
                      <div className="p-3 bg-amber-50 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Civil Dawn</div>
                        <div className="font-medium">{formatTime(selectedSunTimes.civilDawn)}</div>
                        <div className="text-xs text-muted-foreground mt-1">Sun -6° to 0°</div>
                      </div>
                      <div className="p-3 bg-orange-50 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Golden Hour</div>
                        <div className="font-medium">{formatTime(selectedSunTimes.goldenHourMorning.start)}</div>
                        <div className="text-xs text-muted-foreground">to {formatTime(selectedSunTimes.goldenHourMorning.end)}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-3 bg-orange-50 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Golden Hour</div>
                        <div className="font-medium">{formatTime(selectedSunTimes.goldenHourEvening.start)}</div>
                        <div className="text-xs text-muted-foreground">to {formatTime(selectedSunTimes.goldenHourEvening.end)}</div>
                      </div>
                      <div className="p-3 bg-amber-50 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Civil Twilight</div>
                        <div className="font-medium">{formatTime(selectedSunTimes.sunset)}</div>
                        <div className="text-xs text-muted-foreground">to {formatTime(selectedSunTimes.civilDusk)}</div>
                        <div className="text-xs text-muted-foreground mt-1">Sun 0° to -6°</div>
                      </div>
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Nautical Twilight</div>
                        <div className="font-medium">{formatTime(selectedSunTimes.civilDusk)}</div>
                        <div className="text-xs text-muted-foreground">to {formatTime(selectedSunTimes.nauticalDusk)}</div>
                        <div className="text-xs text-muted-foreground mt-1">Sun -6° to -12°</div>
                      </div>
                      <div className="p-3 bg-indigo-50 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Astronomical</div>
                        <div className="font-medium">{formatTime(selectedSunTimes.nauticalDusk)}</div>
                        <div className="text-xs text-muted-foreground">to {formatTime(selectedSunTimes.astronomicalDusk)}</div>
                        <div className="text-xs text-muted-foreground mt-1">Sun -12° to -18°</div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Blue Hour */}
              <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
                <div className="text-sm">
                  <span className="font-medium">Blue Hour ({activeTab === 'sunrise' ? 'Morning' : 'Evening'}):</span>
                  <span className="ml-2">
                    {activeTab === 'sunrise'
                      ? `${formatTime(selectedSunTimes.blueHourMorning.start)} - ${formatTime(selectedSunTimes.blueHourMorning.end)}`
                      : `${formatTime(selectedSunTimes.blueHourEvening.start)} - ${formatTime(selectedSunTimes.blueHourEvening.end)}`
                    }
                  </span>
                  <span className="text-muted-foreground ml-2">(best for moody, cool-toned photos)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Terrain Visibility Card */}
        {location && selectedSunTimes && (
          <Card className="mb-6 border-green-200">
            <CardHeader className="pb-2 bg-green-50">
              <CardTitle className="text-base flex items-center gap-2">
                <Mountains className="w-5 h-5 text-green-600" />
                {activeTab === 'sunrise' ? 'Sunrise' : 'Sunset'} Terrain Visibility
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  {formatAzimuth(activeTab === 'sunrise' ? selectedSunTimes.sunriseAzimuth : selectedSunTimes.sunsetAzimuth)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {horizonLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ArrowsClockwise className="w-4 h-4 animate-spin" />
                  Analyzing terrain along {activeTab} azimuth...
                </div>
              )}

              {horizonError && (
                <div className="text-red-600 text-sm">
                  Error: {horizonError}
                </div>
              )}

              {horizonProfile && !horizonLoading && (
                <div className="space-y-4">
                  {/* Quality Assessment */}
                  <div className={`p-4 rounded-lg ${
                    horizonProfile.quality === 'clear' ? 'bg-green-50 border border-green-200' :
                    horizonProfile.quality === 'minimal' ? 'bg-green-50 border border-green-200' :
                    horizonProfile.quality === 'low' ? 'bg-blue-50 border border-blue-200' :
                    horizonProfile.quality === 'moderate' ? 'bg-amber-50 border border-amber-200' :
                    horizonProfile.quality === 'significant' ? 'bg-orange-50 border border-orange-200' :
                    'bg-red-50 border border-red-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                        horizonProfile.quality === 'clear' || horizonProfile.quality === 'minimal' ? 'bg-green-500' :
                        horizonProfile.quality === 'low' ? 'bg-blue-500' :
                        horizonProfile.quality === 'moderate' ? 'bg-amber-500' :
                        horizonProfile.quality === 'significant' ? 'bg-orange-500' :
                        'bg-red-500'
                      }`}>
                        {horizonProfile.effectiveHorizon.toFixed(0)}°
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold">{horizonProfile.qualityLabel}</div>
                        <div className="text-sm text-muted-foreground">{horizonProfile.qualityDescription}</div>
                      </div>
                    </div>
                  </div>

                  {/* Impact Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="p-3 bg-muted/50 rounded text-center">
                      <div className="text-xs text-muted-foreground">Effective Horizon</div>
                      <div className="font-bold text-lg">{horizonProfile.effectiveHorizon.toFixed(1)}°</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded text-center">
                      <div className="text-xs text-muted-foreground">Sunset Lost</div>
                      <div className="font-bold text-lg">~{horizonProfile.sunsetLostMinutes} min</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded text-center">
                      <div className="text-xs text-muted-foreground">Golden Hour</div>
                      <div className="font-bold text-lg">{Math.round(horizonProfile.goldenHourVisible)}%</div>
                      <div className="text-xs text-muted-foreground">visible</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded text-center">
                      <div className="text-xs text-muted-foreground">Your Elevation</div>
                      <div className="font-bold text-lg">{Math.round(horizonProfile.observerElevation)}m</div>
                    </div>
                  </div>

                  {/* Horizon Profile Visualization */}
                  <div className="mt-4">
                    <div className="text-xs text-muted-foreground mb-2">
                      Terrain profile looking {formatAzimuth(horizonProfile.azimuth)} (sunset direction)
                    </div>
                    <div className="h-32 bg-gradient-to-b from-orange-200 via-orange-100 to-amber-50 rounded-lg relative overflow-hidden">
                      {/* Sun path indicator - shows where sun will be at different times */}
                      <div className="absolute right-4 top-2 flex flex-col gap-1 text-xs">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-full bg-yellow-400" />
                          <span className="text-orange-700">6° (30 min before)</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-full bg-orange-400" />
                          <span className="text-orange-700">0° (sunset)</span>
                        </div>
                      </div>
                      {/* Terrain profile */}
                      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        {/* Golden hour zone (0-6°) */}
                        <rect x="0" y="20" width="100" height="30" fill="rgba(255, 200, 100, 0.2)" />
                        {/* Terrain fill */}
                        <path
                          d={`M 0 100 ${horizonProfile.points.map((p, i) => {
                            const x = ((i + 1) / horizonProfile.points.length) * 100;
                            // Scale: 0° at y=50, each degree = 5 units
                            const y = 100 - (50 + p.angularElevation * 5);
                            return `L ${x} ${Math.max(0, Math.min(100, y))}`;
                          }).join(' ')} L 100 100 Z`}
                          fill="rgba(34, 139, 34, 0.7)"
                          stroke="rgb(22, 101, 22)"
                          strokeWidth="0.5"
                        />
                        {/* Horizon line (0°) */}
                        <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,150,0,0.5)" strokeWidth="1" />
                        {/* 6° line (golden hour start) */}
                        <line x1="0" y1="20" x2="100" y2="20" stroke="rgba(255,200,0,0.3)" strokeDasharray="3,3" />
                      </svg>
                      {/* Labels */}
                      <div className="absolute bottom-1 left-2 text-xs text-muted-foreground">You</div>
                      <div className="absolute bottom-1 right-2 text-xs text-muted-foreground">30 km</div>
                      <div className="absolute left-2 text-xs text-orange-600" style={{ top: '48%' }}>0°</div>
                      <div className="absolute left-2 text-xs text-amber-600" style={{ top: '18%' }}>6°</div>
                    </div>
                  </div>

                  {/* Elevation points detail */}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      View terrain sample points
                    </summary>
                    <div className="mt-2 grid grid-cols-3 gap-1">
                      {horizonProfile.points.map((p, i) => (
                        <div key={i} className="p-1 bg-muted/30 rounded text-center">
                          <div className="font-medium">{p.distance.toFixed(1)} km</div>
                          <div className="text-muted-foreground">{Math.round(p.elevation)} m</div>
                          <div className={p.angularElevation > 0 ? 'text-amber-600' : 'text-green-600'}>
                            {p.angularElevation.toFixed(2)}°
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {openMeteoLoading && (
          <Card className="mb-6">
            <CardContent className="py-8 text-center text-muted-foreground flex items-center justify-center gap-2">
              <ArrowsClockwise className="w-5 h-5 animate-spin" />
              Loading weather data...
            </CardContent>
          </Card>
        )}

        {/* Open-Meteo Data */}
        {location && !openMeteoLoading && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-blue-600 flex items-center gap-2">
              <CloudSun className="w-5 h-5" />
              Weather Data
            </h2>

              {openMeteoError && (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="py-4 text-red-700 text-sm">
                    Error: {openMeteoError}
                  </CardContent>
                </Card>
              )}

              {openMeteoData && (
                <>
                  {/* Sun Times from Open-Meteo */}
                  {openMeteoData.daily && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Sun className="w-4 h-4 text-amber-500" />
                          Sun Times
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs">Sunrise</p>
                          <p className="font-medium">
                            {new Date(openMeteoData.daily.sunrise[0]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Sunset</p>
                          <p className="font-medium">
                            {new Date(openMeteoData.daily.sunset[0]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Current Conditions */}
                  {openMeteoData.current && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Current Conditions</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="p-2 bg-blue-50 rounded text-blue-800 font-medium">
                          {getWeatherDescription(openMeteoData.current.weather_code)}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>Cloud Cover: <span className="font-medium">{openMeteoData.current.cloud_cover}%</span></div>
                          <div>Temp: <span className="font-medium">{Math.round(openMeteoData.current.temperature_2m * 9/5 + 32)}°F</span></div>
                          <div>Humidity: <span className="font-medium">{openMeteoData.current.relative_humidity_2m}%</span></div>
                          <div>Wind: <span className="font-medium">{Math.round(openMeteoData.current.wind_speed_10m * 0.621)} mph</span></div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Cloud Layers - THE KEY DATA */}
                  {openMeteoData.hourly && selectedEventIndex !== null && selectedEventIndex >= 0 && (
                    <Card className="border-blue-200">
                      <CardHeader className="pb-2 bg-blue-50">
                        <CardTitle className="text-sm flex items-center gap-2">
                          {activeTab === 'sunrise' ? (
                            <SunDim className="w-4 h-4 text-orange-500" />
                          ) : (
                            <SunHorizon className="w-4 h-4 text-orange-500" />
                          )}
                          Cloud Layers at {activeTab === 'sunrise' ? 'Sunrise' : 'Sunset'}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-3">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">High Clouds (&gt;6km)</span>
                            <span className="font-medium text-green-600">
                              {openMeteoData.hourly.cloud_cover_high[selectedEventIndex]}%
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: `${openMeteoData.hourly.cloud_cover_high[selectedEventIndex]}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">Best for color - catches light</p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Mid Clouds (2-6km)</span>
                            <span className="font-medium text-amber-600">
                              {openMeteoData.hourly.cloud_cover_mid[selectedEventIndex]}%
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-500 rounded-full"
                              style={{ width: `${openMeteoData.hourly.cloud_cover_mid[selectedEventIndex]}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">Can add drama and texture</p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Low Clouds (&lt;2km)</span>
                            <span className="font-medium text-red-600">
                              {openMeteoData.hourly.cloud_cover_low[selectedEventIndex]}%
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-500 rounded-full"
                              style={{ width: `${openMeteoData.hourly.cloud_cover_low[selectedEventIndex]}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">May block direct sunlight</p>
                        </div>

                        <div className="pt-2 border-t text-xs text-muted-foreground">
                          Total cloud cover: <span className="font-medium">{openMeteoData.hourly.cloud_cover[selectedEventIndex]}%</span>
                          {' | '}
                          Visibility: <span className="font-medium">{(openMeteoData.hourly.visibility[selectedEventIndex] / 1000).toFixed(1)} km</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Hourly Around Event */}
                  {openMeteoData.hourly && selectedDayForecast && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">
                          Hourly ({activeTab === 'sunrise' ? '5am - 9am' : '4pm - 8pm'})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1 text-xs">
                          {openMeteoData.hourly.time
                            .map((time, i) => ({ time, i }))
                            .filter(({ time }) => {
                              const d = new Date(time);
                              const hour = d.getHours();
                              const isSameDay = d.toDateString() === selectedDayForecast.date.toDateString();
                              if (activeTab === 'sunrise') {
                                return isSameDay && hour >= 5 && hour <= 9;
                              } else {
                                return isSameDay && hour >= 16 && hour <= 20;
                              }
                            })
                            .map(({ time, i }) => (
                              <div key={time} className={`flex items-center gap-2 p-1.5 rounded ${i === selectedEventIndex ? 'bg-orange-100' : 'bg-muted/30'}`}>
                                <span className="font-medium w-14">
                                  {new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                </span>
                                <span className="text-muted-foreground">{getWeatherDescription(openMeteoData.hourly!.weather_code[i])}</span>
                                <span className="ml-auto">
                                  H:{openMeteoData.hourly!.cloud_cover_high[i]}%
                                  M:{openMeteoData.hourly!.cloud_cover_mid[i]}%
                                  L:{openMeteoData.hourly!.cloud_cover_low[i]}%
                                </span>
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
          </div>
        )}
      </main>
    </div>
  );
}
