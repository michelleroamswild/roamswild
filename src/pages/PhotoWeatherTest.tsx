import { useState, useEffect, useMemo } from 'react';
import { Camera, Sun, SunHorizon, CloudSun, ArrowsClockwise, Compass, Moon, Mountains, SunDim, Star, Check, X, Question, Crosshair, NavigationArrow } from '@phosphor-icons/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlaceSearch } from '@/components/PlaceSearch';
import { Header } from '@/components/Header';
import { formatTime, getSunTimes, formatAzimuth, SunTimes } from '@/utils/sunCalc';
import { analyzeHorizonProfile, getElevation, HorizonProfile } from '@/utils/terrainVisibility';
import { analyzePhotoConditions, PhotoForecast, OpenMeteoHourly } from '@/utils/photoConditionsAnalyzer';
import { analyzePhotoSpots, fetchNearbyFeatures, RecommendedSpot, PhotoFeature } from '@/utils/photoSpotAnalyzer';
import { analyzeTerrainFeatures, TerrainFeature } from '@/utils/terrainPhotoAnalyzer';
import { searchGooglePhotoSpots, GooglePhotoSpot } from '@/utils/googlePlacesPhotoSpots';

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
  switch (forecast.rating) {
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

  // GPS coordinate input
  const [gpsLat, setGpsLat] = useState('');
  const [gpsLng, setGpsLng] = useState('');
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Photo spots (OSM)
  const [photoSpots, setPhotoSpots] = useState<RecommendedSpot[]>([]);
  const [photoSpotsLoading, setPhotoSpotsLoading] = useState(false);
  const [photoSpotsError, setPhotoSpotsError] = useState<string | null>(null);

  // Terrain features
  const [terrainFeatures, setTerrainFeatures] = useState<TerrainFeature[]>([]);
  const [terrainLoading, setTerrainLoading] = useState(false);
  const [terrainError, setTerrainError] = useState<string | null>(null);

  // Google Places spots
  const [googleSpots, setGoogleSpots] = useState<GooglePhotoSpot[]>([]);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  // Handle GPS coordinate submission
  const handleGpsSubmit = () => {
    setGpsError(null);
    const lat = parseFloat(gpsLat);
    const lng = parseFloat(gpsLng);

    if (isNaN(lat) || isNaN(lng)) {
      setGpsError('Please enter valid coordinates');
      return;
    }

    if (lat < -90 || lat > 90) {
      setGpsError('Latitude must be between -90 and 90');
      return;
    }

    if (lng < -180 || lng > 180) {
      setGpsError('Longitude must be between -180 and 180');
      return;
    }

    setLocation({
      name: `GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      lat,
      lng,
    });
  };

  // Use current location from browser
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setGpsLat(lat.toFixed(6));
        setGpsLng(lng.toFixed(6));
        setLocation({
          name: `Current Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          lat,
          lng,
        });
      },
      (error) => {
        setGpsError(`Location error: ${error.message}`);
      }
    );
  };

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
  // Keep showing today's event for a few hours after it occurs
  const getEffectiveDayIndex = useMemo(() => {
    if (multiDayForecast.length === 0) return 0;

    const now = new Date();
    const todayForecast = multiDayForecast[0];
    const hoursAfterToKeepShowing = 3; // Show tonight's sunset for 3 hours after

    if (activeTab === 'sunrise') {
      const sunriseTime = todayForecast.sunTimes.sunrise;
      const cutoffTime = new Date(sunriseTime.getTime() + hoursAfterToKeepShowing * 60 * 60 * 1000);
      // If past the cutoff (3 hours after sunrise), default to tomorrow
      if (now > cutoffTime) {
        return selectedDayIndex === 0 ? 1 : selectedDayIndex;
      }
    } else {
      const sunsetTime = todayForecast.sunTimes.sunset;
      const cutoffTime = new Date(sunsetTime.getTime() + hoursAfterToKeepShowing * 60 * 60 * 1000);
      // If past the cutoff (3 hours after sunset), default to tomorrow
      if (now > cutoffTime) {
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

  // Fetch and analyze photo spots when location and sun times are available
  useEffect(() => {
    if (!location || !selectedSunTimes) return;

    const fetchAndAnalyzeSpots = async () => {
      setPhotoSpotsLoading(true);
      setPhotoSpotsError(null);

      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        // Fetch nearby features from OSM via our proxy
        const features = await fetchNearbyFeatures(
          location.lat,
          location.lng,
          15, // 15km radius
          supabaseUrl,
          anonKey
        );

        // Get the sun azimuth for the active event
        const sunAzimuth = activeTab === 'sunrise'
          ? selectedSunTimes.sunriseAzimuth
          : selectedSunTimes.sunsetAzimuth;
        const isSunrise = activeTab === 'sunrise';

        // Analyze spots based on sun position
        const spots = analyzePhotoSpots(
          location.lat,
          location.lng,
          features,
          sunAzimuth,
          isSunrise
        );

        // Only keep top spots (score >= 40)
        const topSpots = spots.filter(s => s.overallScore >= 40).slice(0, 10);
        setPhotoSpots(topSpots);
      } catch (err) {
        console.error('Photo spots error:', err);
        setPhotoSpotsError(err instanceof Error ? err.message : 'Failed to fetch photo spots');
      } finally {
        setPhotoSpotsLoading(false);
      }
    };

    fetchAndAnalyzeSpots();
  }, [location, selectedSunTimes, activeTab]);

  // Fetch terrain features when location and sun times are available
  useEffect(() => {
    if (!location || !selectedSunTimes) return;

    const fetchTerrainFeatures = async () => {
      setTerrainLoading(true);
      setTerrainError(null);

      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        const sunAzimuth = activeTab === 'sunrise'
          ? selectedSunTimes.sunriseAzimuth
          : selectedSunTimes.sunsetAzimuth;
        const isSunrise = activeTab === 'sunrise';

        const features = await analyzeTerrainFeatures(
          location.lat,
          location.lng,
          sunAzimuth,
          isSunrise,
          10, // 10km radius
          supabaseUrl,
          anonKey
        );

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

  // Fetch Google Places when location changes
  useEffect(() => {
    if (!location) return;

    const fetchGooglePlaces = async () => {
      setGoogleLoading(true);
      setGoogleError(null);

      try {
        const spots = await searchGooglePhotoSpots(
          location.lat,
          location.lng,
          15 // 15km radius
        );
        setGoogleSpots(spots);
      } catch (err) {
        console.error('Google Places error:', err);
        setGoogleError(err instanceof Error ? err.message : 'Failed to fetch places');
      } finally {
        setGoogleLoading(false);
      }
    };

    fetchGooglePlaces();
  }, [location]);

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
    const hasHighClouds = photoForecast.clouds.high >= 20;
    if (hasHighClouds && !isSunrise) {
      afterglowEnd = new Date(sunEvent.getTime() + 30 * 60000); // 30 min afterglow
      windowEnd = new Date(Math.max(twilightEnd.getTime(), afterglowEnd.getTime()));
    }

    // Adjust based on timing recommendation
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
          <CardContent className="space-y-4">
            <PlaceSearch
              onPlaceSelect={handlePlaceSelect}
              placeholder="Search for a place..."
            />

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-muted-foreground">Or enter GPS coordinates</span>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Latitude</label>
                <Input
                  type="text"
                  placeholder="e.g. 37.7749"
                  value={gpsLat}
                  onChange={(e) => setGpsLat(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGpsSubmit()}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Longitude</label>
                <Input
                  type="text"
                  placeholder="e.g. -122.4194"
                  value={gpsLng}
                  onChange={(e) => setGpsLng(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGpsSubmit()}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleGpsSubmit} size="default">
                  <Crosshair className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleUseCurrentLocation}
              className="w-full"
            >
              <NavigationArrow className="w-4 h-4 mr-2" />
              Use My Current Location
            </Button>

            {gpsError && (
              <p className="text-sm text-red-500">{gpsError}</p>
            )}

            {location && (
              <p className="text-sm text-muted-foreground">
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
                    // Only disable if more than 3 hours past the event
                    const hoursAfterToKeepShowing = 3;
                    const eventTime = activeTab === 'sunrise' ? day.sunTimes.sunrise : day.sunTimes.sunset;
                    const cutoffTime = new Date(eventTime.getTime() + hoursAfterToKeepShowing * 60 * 60 * 1000);
                    const isPast = index === 0 && new Date() > cutoffTime;

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
                            forecast.rating === 'excellent' ? 'text-green-600' :
                            forecast.rating === 'good' ? 'text-blue-600' :
                            forecast.rating === 'fair' ? 'text-amber-600' :
                            'text-gray-500'
                          }`}>
                            {forecast.rating}
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
            photoForecast.rating === 'excellent' ? 'border-green-400 bg-gradient-to-br from-green-50 to-emerald-50' :
            photoForecast.rating === 'good' ? 'border-blue-400 bg-gradient-to-br from-blue-50 to-sky-50' :
            photoForecast.rating === 'fair' ? 'border-amber-400 bg-gradient-to-br from-amber-50 to-yellow-50' :
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
                <div className="text-right">
                  <div className={`px-4 py-2 rounded-full text-white font-bold ${
                    photoForecast.rating === 'excellent' ? 'bg-green-500' :
                    photoForecast.rating === 'good' ? 'bg-blue-500' :
                    photoForecast.rating === 'fair' ? 'bg-amber-500' :
                    'bg-gray-500'
                  }`}>
                    {photoForecast.score}/100
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {photoForecast.rating.toUpperCase()}
                  </div>
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

              {/* Score Breakdown */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Score Breakdown</div>
                {photoForecast.insights.map((insight, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-24 text-xs text-muted-foreground">{insight.factor}</div>
                    <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          insight.score >= 75 ? 'bg-green-500' :
                          insight.score >= 50 ? 'bg-blue-500' :
                          insight.score >= 30 ? 'bg-amber-500' :
                          'bg-red-400'
                        }`}
                        style={{ width: `${insight.score}%` }}
                      />
                    </div>
                    <div className="w-12 text-xs text-right font-medium">
                      {insight.score}
                      <span className="text-muted-foreground">/{insight.weight}w</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Factor Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {photoForecast.insights.map((insight, i) => (
                  <div
                    key={i}
                    className={`p-2 rounded-lg border-l-4 ${
                      insight.score >= 75 ? 'bg-green-50 border-green-500' :
                      insight.score >= 50 ? 'bg-blue-50 border-blue-400' :
                      insight.score >= 30 ? 'bg-amber-50 border-amber-400' :
                      'bg-red-50 border-red-400'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{insight.factor}</span>
                      <span className="text-xs">{insight.value}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {insight.description}
                    </div>
                  </div>
                ))}
              </div>

              {/* Cloud Layers Quick View */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2 bg-white/60 rounded-lg">
                  <div className="text-xs text-muted-foreground">High</div>
                  <div className={`text-xl font-bold ${
                    photoForecast.clouds.high >= 20 && photoForecast.clouds.high <= 60
                      ? 'text-green-600' : 'text-gray-600'
                  }`}>
                    {Math.round(photoForecast.clouds.high)}%
                  </div>
                </div>
                <div className="p-2 bg-white/60 rounded-lg">
                  <div className="text-xs text-muted-foreground">Mid</div>
                  <div className={`text-xl font-bold ${
                    photoForecast.clouds.mid >= 20 && photoForecast.clouds.mid <= 50
                      ? 'text-blue-600' : 'text-gray-600'
                  }`}>
                    {Math.round(photoForecast.clouds.mid)}%
                  </div>
                </div>
                <div className="p-2 bg-white/60 rounded-lg">
                  <div className="text-xs text-muted-foreground">Low</div>
                  <div className={`text-xl font-bold ${
                    photoForecast.clouds.low < 30 ? 'text-green-600' :
                    photoForecast.clouds.low < 50 ? 'text-amber-600' :
                    'text-red-600'
                  }`}>
                    {Math.round(photoForecast.clouds.low)}%
                  </div>
                </div>
                <div className="p-2 bg-white/60 rounded-lg">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="text-xl font-bold text-gray-600">
                    {Math.round(photoForecast.clouds.total)}%
                  </div>
                </div>
              </div>

              {/* Conditions */}
              {photoForecast.conditions.isClearing && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="font-medium text-green-800">🌤️ Post-Storm Clearing</div>
                  <div className="text-sm text-green-700">Exceptional color potential as skies clear!</div>
                </div>
              )}

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
                      photoForecast.atmosphere.visibility > 20 ? 'text-green-600' :
                      photoForecast.atmosphere.visibility > 10 ? 'text-blue-600' :
                      'text-amber-600'
                    }`}>
                      {photoForecast.atmosphere.visibility > 20 ? '✨ Crystal clear' :
                       photoForecast.atmosphere.visibility > 10 ? '🌫️ Soft atmosphere' :
                       '😶‍🌫️ Hazy'}
                    </div>
                  </div>

                  {/* Humidity */}
                  <div className="p-2 bg-white/60 rounded-lg">
                    <div className="text-muted-foreground mb-1">Humidity</div>
                    <div className="font-bold text-lg">
                      {Math.round(photoForecast.atmosphere.humidity)}%
                    </div>
                    <div className={`text-xs ${
                      photoForecast.atmosphere.humidity < 40 ? 'text-green-600' :
                      photoForecast.atmosphere.humidity > 80 ? 'text-amber-600' :
                      'text-gray-600'
                    }`}>
                      {photoForecast.atmosphere.humidity < 40 ? 'Vibrant colors' :
                       photoForecast.atmosphere.humidity > 80 ? 'Soft colors' :
                       'Good saturation'}
                    </div>
                  </div>

                  {/* AOD / Aerosols */}
                  <div className="p-2 bg-white/60 rounded-lg">
                    <div className="text-muted-foreground mb-1">Aerosols</div>
                    <div className="font-bold text-lg">
                      {photoForecast.atmosphere.aod !== null
                        ? photoForecast.atmosphere.aod.toFixed(2)
                        : 'N/A'}
                    </div>
                    <div className={`text-xs ${
                      photoForecast.atmosphere.aod !== null && photoForecast.atmosphere.aod >= 0.1 && photoForecast.atmosphere.aod <= 0.3
                        ? 'text-green-600'
                        : photoForecast.atmosphere.aod !== null && photoForecast.atmosphere.aod > 0.5
                        ? 'text-amber-600'
                        : 'text-gray-600'
                    }`}>
                      {photoForecast.atmosphere.aod !== null
                        ? (photoForecast.atmosphere.aod >= 0.1 && photoForecast.atmosphere.aod <= 0.3
                            ? '✨ Ideal for color'
                            : photoForecast.atmosphere.aod > 0.5
                            ? '🌫️ Hazy'
                            : 'Clean air')
                        : 'Data unavailable'}
                    </div>
                  </div>

                  {/* Precipitation */}
                  <div className="p-2 bg-white/60 rounded-lg">
                    <div className="text-muted-foreground mb-1">Precipitation</div>
                    <div className="font-bold text-lg">
                      {photoForecast.conditions.precipitation}%
                    </div>
                    <div className="text-xs">
                      {photoForecast.conditions.isClearing ? (
                        <span className="text-green-600">🌤️ Clearing</span>
                      ) : photoForecast.conditions.precipitation > 50 ? (
                        <span className="text-amber-600">☔ Rain likely</span>
                      ) : (
                        <span className="text-gray-600">Dry conditions</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Fog/Mist Alert */}
                {photoForecast.conditions.fogRisk && (
                  <div className="mt-2 p-2 bg-blue-50 rounded-lg text-xs text-blue-800 flex items-center gap-2">
                    <span>🌁</span>
                    <span>Temperature near dew point — fog or mist may form, creating moody atmosphere</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recommended Photo Spots */}
        {location && selectedSunTimes && (
          <Card className="mb-6 border-purple-200">
            <CardHeader className="pb-2 bg-purple-50">
              <CardTitle className="text-base flex items-center gap-2">
                <Camera className="w-5 h-5 text-purple-600" />
                Recommended Photo Spots
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  Within 15 km • Based on {activeTab} direction
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {photoSpotsLoading && (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <ArrowsClockwise className="w-4 h-4 animate-spin" />
                  Finding nearby photo spots...
                </div>
              )}

              {photoSpotsError && (
                <div className="text-red-600 text-sm py-4">
                  Error: {photoSpotsError}
                </div>
              )}

              {!photoSpotsLoading && !photoSpotsError && photoSpots.length === 0 && (
                <div className="text-muted-foreground text-sm py-4">
                  No recommended photo spots found in this area for the current sun direction.
                </div>
              )}

              {!photoSpotsLoading && photoSpots.length > 0 && (
                <div className="space-y-3">
                  {photoSpots.map((spot, index) => (
                    <div
                      key={`${spot.feature.type}-${spot.feature.id}`}
                      className={`p-3 rounded-lg border ${
                        spot.overallScore >= 75 ? 'bg-green-50 border-green-200' :
                        spot.overallScore >= 55 ? 'bg-blue-50 border-blue-200' :
                        'bg-amber-50 border-amber-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center text-white ${
                              spot.overallScore >= 75 ? 'bg-green-500' :
                              spot.overallScore >= 55 ? 'bg-blue-500' :
                              'bg-amber-500'
                            }`}>
                              {index + 1}
                            </span>
                            <div>
                              <div className="font-medium">
                                {spot.feature.name || `Unnamed ${spot.feature.featureType}`}
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                                <span className="capitalize">{spot.feature.featureType}</span>
                                <span>•</span>
                                <span>{spot.distance.toFixed(1)} km {spot.bearingLabel}</span>
                                {spot.feature.elevation && (
                                  <>
                                    <span>•</span>
                                    <span>{spot.feature.elevation}m</span>
                                  </>
                                )}
                                <span>•</span>
                                <span className="font-mono text-[10px]">
                                  {spot.feature.lat.toFixed(5)}, {spot.feature.lng.toFixed(5)}
                                </span>
                                <span>•</span>
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${spot.feature.lat},${spot.feature.lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  View on Map
                                </a>
                              </div>
                            </div>
                          </div>

                          <div className="mt-2 text-sm">
                            {spot.recommendation}
                          </div>

                          {/* Top opportunity details */}
                          {spot.topOpportunity && (
                            <div className="mt-2 p-2 bg-white/60 rounded text-xs">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-full font-medium ${
                                  spot.topOpportunity.type === 'reflection' ? 'bg-blue-100 text-blue-700' :
                                  spot.topOpportunity.type === 'alpenglow' ? 'bg-pink-100 text-pink-700' :
                                  spot.topOpportunity.type === 'silhouette' ? 'bg-purple-100 text-purple-700' :
                                  spot.topOpportunity.type === 'viewpoint' ? 'bg-green-100 text-green-700' :
                                  'bg-amber-100 text-amber-700'
                                }`}>
                                  {spot.topOpportunity.type.replace('_', ' ')}
                                </span>
                                <span className="text-muted-foreground">
                                  {spot.topOpportunity.shootingDirectionLabel}
                                </span>
                              </div>
                              <div className="mt-1 text-muted-foreground">
                                {spot.topOpportunity.description}
                              </div>
                            </div>
                          )}

                          {/* Arrival tip */}
                          {spot.arrivalTip && (
                            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                              <span>💡</span>
                              {spot.arrivalTip}
                            </div>
                          )}
                        </div>

                        {/* Score badge */}
                        <div className={`px-3 py-1 rounded-full text-sm font-bold text-white ${
                          spot.overallScore >= 75 ? 'bg-green-500' :
                          spot.overallScore >= 55 ? 'bg-blue-500' :
                          'bg-amber-500'
                        }`}>
                          {spot.overallScore}
                        </div>
                      </div>

                      {/* Additional opportunities */}
                      {spot.opportunities.length > 1 && (
                        <div className="mt-2 pt-2 border-t border-white/50">
                          <div className="text-xs text-muted-foreground">
                            Also good for:{' '}
                            {spot.opportunities.slice(1, 3).map((opp, i) => (
                              <span key={opp.type}>
                                {i > 0 && ', '}
                                {opp.type.replace('_', ' ')} ({opp.score})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Terrain-Based Photo Spots */}
        {location && selectedSunTimes && (
          <Card className="mb-6 border-orange-200">
            <CardHeader className="pb-2 bg-orange-50">
              <CardTitle className="text-base flex items-center gap-2">
                <Mountains className="w-5 h-5 text-orange-600" />
                Terrain Analysis
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  Features catching {activeTab} light
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {terrainLoading && (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <ArrowsClockwise className="w-4 h-4 animate-spin" />
                  Analyzing terrain for photogenic features...
                </div>
              )}

              {terrainError && (
                <div className="text-red-600 text-sm py-4">
                  Error: {terrainError}
                </div>
              )}

              {!terrainLoading && !terrainError && terrainFeatures.length === 0 && (
                <div className="text-muted-foreground text-sm py-4">
                  No accessible terrain features found. This area may be flat, or interesting features lack nearby trail/road access.
                </div>
              )}

              {!terrainLoading && terrainFeatures.length > 0 && (
                <div className="space-y-3">
                  {terrainFeatures.map((feature, index) => (
                    <div
                      key={`terrain-${index}`}
                      className={`p-3 rounded-lg border ${
                        feature.score >= 75 ? 'bg-orange-50 border-orange-200' :
                        feature.score >= 60 ? 'bg-amber-50 border-amber-200' :
                        'bg-yellow-50 border-yellow-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              feature.featureType === 'cliff' ? 'bg-red-100 text-red-700' :
                              feature.featureType === 'ridge' ? 'bg-purple-100 text-purple-700' :
                              feature.featureType === 'peak' ? 'bg-blue-100 text-blue-700' :
                              feature.featureType === 'slope' ? 'bg-green-100 text-green-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {feature.featureType}
                            </span>
                            <span className="text-sm font-medium">
                              {feature.aspectLabel}
                            </span>
                            {feature.curvature === 'convex' && (
                              <span className="text-xs text-orange-600">Convex</span>
                            )}
                            {feature.accessible ? (
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                feature.accessType === 'road' ? 'bg-green-100 text-green-700' :
                                feature.accessType === 'track' ? 'bg-lime-100 text-lime-700' :
                                'bg-emerald-100 text-emerald-700'
                              }`}>
                                {feature.accessType} {feature.accessDistance}m
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-600">
                                No trail access
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                            <span>{feature.distanceKm.toFixed(1)} km {feature.bearingLabel}</span>
                            <span>•</span>
                            <span>{Math.round(feature.elevation)}m elev</span>
                            <span>•</span>
                            <span>{feature.slopeCategory} slope ({Math.round(feature.slope)}°)</span>
                            <span>•</span>
                            <span className="font-mono text-[10px]">
                              {feature.lat.toFixed(5)}, {feature.lng.toFixed(5)}
                            </span>
                            <span>•</span>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${feature.lat},${feature.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              Map
                            </a>
                          </div>

                          <div className="mt-2 text-sm">
                            {feature.recommendation}
                          </div>

                          <div className="mt-1 text-xs text-orange-700 font-medium">
                            {feature.lightingWindow}
                          </div>
                        </div>

                        <div className={`px-3 py-1 rounded-full text-sm font-bold text-white ${
                          feature.score >= 75 ? 'bg-orange-500' :
                          feature.score >= 60 ? 'bg-amber-500' :
                          'bg-yellow-500'
                        }`}>
                          {feature.score}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Google Places Photo Spots */}
        {location && (
          <Card className="mb-6 border-blue-200">
            <CardHeader className="pb-2 bg-blue-50">
              <CardTitle className="text-base flex items-center gap-2">
                <Compass className="w-5 h-5 text-blue-600" />
                Scenic Viewpoints
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  From Google Places
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {googleLoading && (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <ArrowsClockwise className="w-4 h-4 animate-spin" />
                  Searching for scenic locations...
                </div>
              )}

              {googleError && (
                <div className="text-red-600 text-sm py-4">
                  Error: {googleError}
                </div>
              )}

              {!googleLoading && !googleError && googleSpots.length === 0 && (
                <div className="text-muted-foreground text-sm py-4">
                  No scenic viewpoints found nearby.
                </div>
              )}

              {!googleLoading && googleSpots.length > 0 && (
                <div className="space-y-3">
                  {googleSpots.slice(0, 8).map((spot) => (
                    <div
                      key={spot.placeId}
                      className={`p-3 rounded-lg border ${
                        spot.score >= 75 ? 'bg-blue-50 border-blue-200' :
                        spot.score >= 60 ? 'bg-sky-50 border-sky-200' :
                        'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              spot.category === 'viewpoint' ? 'bg-green-100 text-green-700' :
                              spot.category === 'nature' ? 'bg-emerald-100 text-emerald-700' :
                              spot.category === 'park' ? 'bg-lime-100 text-lime-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {spot.category}
                            </span>
                            <span className="font-medium">{spot.name}</span>
                          </div>

                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                            <span>{spot.distanceKm.toFixed(1)} km {spot.bearingLabel}</span>
                            {spot.rating && (
                              <>
                                <span>•</span>
                                <span className="text-amber-600">★ {spot.rating.toFixed(1)}</span>
                                <span className="text-muted-foreground">({spot.userRatingsTotal})</span>
                              </>
                            )}
                            <span>•</span>
                            <span className="font-mono text-[10px]">
                              {spot.lat.toFixed(5)}, {spot.lng.toFixed(5)}
                            </span>
                            <span>•</span>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              View on Map
                            </a>
                          </div>

                          {spot.vicinity && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {spot.vicinity}
                            </div>
                          )}
                        </div>

                        <div className={`px-3 py-1 rounded-full text-sm font-bold text-white ${
                          spot.score >= 75 ? 'bg-blue-500' :
                          spot.score >= 60 ? 'bg-sky-500' :
                          'bg-slate-500'
                        }`}>
                          {spot.score}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
