import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Path,
  Clock,
  MapPin,
  MapPinArea,
  NavigationArrow,
  Star,
  Boot,
  Tent,
  Eye,
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
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTrip } from '@/context/TripContext';
import { GoogleMap } from '@/components/GoogleMap';
import { Marker, DirectionsRenderer } from '@react-google-maps/api';
import { TripStop, TripDay } from '@/types/trip';
import { toast } from 'sonner';
import { AlternativeHikesModal } from '@/components/AlternativeHikesModal';
import { AlternativeCampsitesModal } from '@/components/AlternativeCampsitesModal';
import { AddStopModal } from '@/components/AddStopModal';
import { createMarkerIcon, getTypeStyles } from '@/utils/mapMarkers';
import { estimateDayTime } from '@/utils/tripValidation';
import { getAllTrailsUrl, estimateTrailLength } from '@/utils/hikeUtils';
import { getTripSlug, getTripUrl, getDayUrl } from '@/utils/slugify';

// NOAA Weather types
interface WeatherForecast {
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
}

// Cache for weather data to avoid repeated API calls
const weatherCache = new Map<string, WeatherForecast>();

// Get weather icon based on forecast
function getWeatherIcon(forecast: string) {
  const lower = forecast.toLowerCase();
  if (lower.includes('snow')) return Snowflake;
  if (lower.includes('rain') || lower.includes('shower')) return CloudRain;
  if (lower.includes('cloud') || lower.includes('overcast')) return Cloud;
  if (lower.includes('wind')) return Wind;
  return Sun;
}

// Fetch weather from NOAA API
async function fetchWeather(lat: number, lng: number): Promise<WeatherForecast | null> {
  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;

  // Check cache first
  if (weatherCache.has(cacheKey)) {
    return weatherCache.get(cacheKey)!;
  }

  try {
    // Step 1: Get the forecast URL for this location
    const pointsResponse = await fetch(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`,
      {
        headers: {
          'User-Agent': 'TripPlanner (contact@example.com)',
          'Accept': 'application/geo+json',
        },
      }
    );

    if (!pointsResponse.ok) {
      return null;
    }

    const pointsData = await pointsResponse.json();
    const forecastUrl = pointsData.properties?.forecast;

    if (!forecastUrl) {
      return null;
    }

    // Step 2: Get the actual forecast
    const forecastResponse = await fetch(forecastUrl, {
      headers: {
        'User-Agent': 'TripPlanner (contact@example.com)',
        'Accept': 'application/geo+json',
      },
    });

    if (!forecastResponse.ok) {
      return null;
    }

    const forecastData = await forecastResponse.json();
    const periods = forecastData.properties?.periods;

    if (!periods || periods.length === 0) {
      return null;
    }

    // Get the first period (current/today)
    const current = periods[0];
    const weather: WeatherForecast = {
      temperature: current.temperature,
      temperatureUnit: current.temperatureUnit,
      shortForecast: current.shortForecast,
    };

    // Cache the result
    weatherCache.set(cacheKey, weather);
    return weather;
  } catch (error) {
    console.error('Weather fetch error:', error);
    return null;
  }
}

const getIcon = (type: string) => {
  switch (type) {
    case 'hike':
      return Boot;
    case 'gas':
      return GasPump;
    case 'camp':
      return Tent;
    case 'viewpoint':
      return Eye;
    case 'start':
    case 'end':
      return MapPin;
    default:
      return MapPinArea;
  }
};

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

  const dayNum = parseInt(dayNumber || '1', 10);

  // Load trip if not already loaded
  useEffect(() => {
    if (slug && (!generatedTrip || getTripSlug(generatedTrip.config.name) !== slug)) {
      const loaded = loadSavedTripBySlug(slug);
      if (!loaded) {
        navigate('/trips');
      }
    }
  }, [slug, generatedTrip, loadSavedTripBySlug, navigate]);

  // Get the current day's data
  const day = generatedTrip?.days.find(d => d.day === dayNum);

  // Fetch directions for this day
  useEffect(() => {
    if (!mapsLoaded || !generatedTrip || !day || day.stops.length === 0) {
      return;
    }

    const directionsService = new google.maps.DirectionsService();
    const startLocation = generatedTrip.config.startLocation?.coordinates;
    const baseLocation = generatedTrip.config.baseLocation?.coordinates;

    // Determine where this day starts from
    let dayOrigin: google.maps.LatLngLiteral;

    if (dayNum === 1) {
      dayOrigin = startLocation || baseLocation || day.stops[0].coordinates;
    } else {
      const prevDay = generatedTrip.days.find(d => d.day === dayNum - 1);
      const prevCampsite = prevDay?.stops.find(s => s.type === 'camp');
      dayOrigin = prevCampsite?.coordinates || day.stops[0].coordinates;
    }

    // Day ends at this day's campsite, or last activity if no camp
    const dayCampsite = day.stops.find(s => s.type === 'camp');
    const dayActivities = day.stops.filter(s => s.type === 'hike' || s.type === 'viewpoint');
    const dayDestination = dayCampsite?.coordinates || dayActivities[dayActivities.length - 1]?.coordinates || day.stops[day.stops.length - 1]?.coordinates;

    if (!dayDestination) {
      return;
    }

    // Waypoints are the activities for this day
    const waypoints = dayActivities.map(stop => ({
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
        if (status === google.maps.DirectionsStatus.OK && result) {
          setDirections(result);
        }
      }
    );
  }, [mapsLoaded, generatedTrip, day, dayNum]);

  // Fetch weather for this day's main location
  useEffect(() => {
    if (!day || day.stops.length === 0) return;

    // Get the main location for weather - use first hike/viewpoint, or first stop
    const mainStop = day.stops.find(s => s.type === 'hike' || s.type === 'viewpoint') || day.stops[0];
    if (!mainStop) return;

    setWeatherLoading(true);
    fetchWeather(mainStop.coordinates.lat, mainStop.coordinates.lng)
      .then(w => {
        setWeather(w);
      })
      .finally(() => {
        setWeatherLoading(false);
      });
  }, [day]);

  const handleOpenHikeSwap = (hike: TripStop) => {
    setSelectedHikeForSwap(hike);
    setHikeModalOpen(true);
  };

  const handleSwapHike = (newHike: TripStop) => {
    if (selectedHikeForSwap) {
      updateTripStop(selectedHikeForSwap.day, selectedHikeForSwap.id, newHike);
      toast.success('Hike updated!', {
        description: `Changed to ${newHike.name}`,
      });
    }
  };

  const handleOpenCampsiteSwap = (campsite: TripStop) => {
    setSelectedCampsiteForSwap(campsite);
    setCampsiteModalOpen(true);
  };

  const handleSwapCampsite = (newCampsite: TripStop) => {
    if (selectedCampsiteForSwap) {
      updateTripStop(selectedCampsiteForSwap.day, selectedCampsiteForSwap.id, newCampsite);
      toast.success('Campsite updated!', {
        description: `Changed to ${newCampsite.name}`,
      });
    }
  };

  const handleRemoveStop = (stop: TripStop) => {
    removeTripStop(dayNum, stop.id);
    toast.success('Stop removed', {
      description: `Removed ${stop.name}`,
    });
  };

  const handleAddStop = (stop: TripStop) => {
    addTripStop(dayNum, stop);
    toast.success('Stop added!', {
      description: `Added ${stop.name} to Day ${dayNum}`,
    });
  };

  const handleNavigateDay = () => {
    if (!day || day.stops.length === 0) return;

    const stops = day.stops;
    const dest = `${stops[stops.length - 1].coordinates.lat},${stops[stops.length - 1].coordinates.lng}`;

    // Build navigation URL with current location as origin (on mobile)
    const buildNavUrl = (origin?: string) => {
      // If using current location, all stops become waypoints
      // Otherwise, first stop is origin and rest (except last) are waypoints
      let waypoints: string;
      if (origin) {
        // Using current location - all stops except last are waypoints
        waypoints = stops.slice(0, -1)
          .map(s => `${s.coordinates.lat},${s.coordinates.lng}`)
          .join('|');
      } else {
        // Using first stop as origin - middle stops are waypoints
        waypoints = stops.slice(1, -1)
          .map(s => `${s.coordinates.lat},${s.coordinates.lng}`)
          .join('|');
        origin = `${stops[0].coordinates.lat},${stops[0].coordinates.lng}`;
      }

      return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}`;
    };

    // Try to get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const origin = `${position.coords.latitude},${position.coords.longitude}`;
          window.open(buildNavUrl(origin), '_blank');
        },
        () => {
          // Geolocation failed or denied - use first stop as origin
          window.open(buildNavUrl(), '_blank');
        },
        { timeout: 5000, maximumAge: 60000 }
      );
    } else {
      // Geolocation not available - use first stop as origin
      window.open(buildNavUrl(), '_blank');
    }
  };

  if (!generatedTrip || !day) {
    return null;
  }

  // Calculate map center
  const mapCenter = day.stops.length > 0
    ? {
        lat: day.stops.reduce((sum, s) => sum + s.coordinates.lat, 0) / day.stops.length,
        lng: day.stops.reduce((sum, s) => sum + s.coordinates.lng, 0) / day.stops.length,
      }
    : { lat: 37.7749, lng: -122.4194 };

  // Determine the main destination for this day (viewpoint or first major stop)
  const mainDestination = day.stops.find(s => s.type === 'viewpoint') || day.stops[0];
  const destinationName = mainDestination?.name || `Day ${dayNum}`;

  // Determine where this day starts from for the summary
  const getOriginName = (): string => {
    if (dayNum === 1) {
      return generatedTrip.config.startLocation?.name ||
             generatedTrip.config.baseLocation?.name ||
             'your starting point';
    }
    const prevDay = generatedTrip.days.find(d => d.day === dayNum - 1);
    const prevCampsite = prevDay?.stops.find(s => s.type === 'camp');
    return prevCampsite?.name || 'camp';
  };

  // Generate a contextual summary for the day
  const getDaySummary = (): string => {
    const originName = getOriginName();
    const isLastDay = dayNum === generatedTrip.days.length;
    const hasHike = day.stops.some(s => s.type === 'hike');
    const hasCamp = day.stops.some(s => s.type === 'camp');

    if (dayNum === 1) {
      if (hasHike && hasCamp) {
        return `Starting your adventure from ${originName}. Explore ${destinationName}, hit the trails, and set up camp for the night.`;
      } else if (hasHike) {
        return `Starting your adventure from ${originName}. Drive to ${destinationName} and enjoy a hike.`;
      } else {
        return `Starting your drive from ${originName} to ${destinationName}.`;
      }
    } else if (isLastDay && generatedTrip.config.returnToStart) {
      return `Final day! Head back from ${originName} to ${generatedTrip.config.startLocation?.name || 'home'}.`;
    } else {
      if (hasHike && hasCamp) {
        return `Continuing from ${originName}. Explore ${destinationName}, enjoy a hike, and set up camp.`;
      } else if (hasHike) {
        return `Continuing from ${originName}. Drive to ${destinationName} and hit the trails.`;
      } else {
        return `Continuing your journey from ${originName} to ${destinationName}.`;
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to={getTripUrl(generatedTrip.config.name)}>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Day {dayNum} of {generatedTrip.days.length}
                </p>
                <h1 className="text-xl font-display font-bold text-foreground">
                  {destinationName}
                </h1>
              </div>
            </div>
            <Button variant="primary" size="sm" onClick={handleNavigateDay}>
              <NavigationArrow className="w-4 h-4 mr-2" />
              Navigate
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full">
        <div className="grid lg:grid-cols-2">
          {/* Map Section */}
          <div className="order-2 lg:order-1 h-[400px] lg:h-[calc(100vh-73px)] lg:sticky lg:top-[73px]">
            <div className="relative w-full h-full">
              <GoogleMap
                center={directions ? undefined : mapCenter}
                zoom={10}
                className="w-full h-full"
                onLoad={() => setMapsLoaded(true)}
              >
                {directions && (
                  <DirectionsRenderer
                    directions={directions}
                    options={{
                      suppressMarkers: true,
                      polylineOptions: {
                        strokeColor: '#2d5a3d',
                        strokeWeight: 5,
                        strokeOpacity: 1,
                      },
                    }}
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

              {/* Route info overlay */}
              <div className="absolute bottom-4 left-4 right-4 z-10">
                <div className="bg-card/95 backdrop-blur-sm rounded-xl border border-border p-4 shadow-lg">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-full">
                        <span className="text-lg font-bold text-primary">{dayNum}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">Day {dayNum}</p>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Path className="w-3 h-3" />
                            {day.drivingDistance}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {day.drivingTime}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {day.stops.length} stops
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button variant="primary" size="sm" onClick={handleNavigateDay}>
                      <NavigationArrow className="w-4 h-4 mr-2" />
                      Navigate Day {dayNum}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Day Details */}
          <div className="order-1 lg:order-2 space-y-4 p-6 lg:h-[calc(100vh-73px)] lg:overflow-y-auto">
            {/* Day Summary */}
            <Card className="bg-gradient-card">
              <CardContent className="p-5">
                <p className="text-foreground leading-relaxed">
                  {getDaySummary()}
                </p>
                <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border/50 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Path className="w-4 h-4 text-terracotta" />
                    <span className="text-foreground font-medium">{day.drivingDistance}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{day.drivingTime}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="text-foreground">{day.stops.length} stops</span>
                  </div>
                  {weatherLoading && (
                    <div className="flex items-center gap-2">
                      <SpinnerGap className="w-4 h-4 text-blue-500 animate-spin" />
                      <span className="text-muted-foreground text-sm">Loading weather...</span>
                    </div>
                  )}
                  {weather && !weatherLoading && (() => {
                    const WeatherIcon = getWeatherIcon(weather.shortForecast);
                    return (
                      <div className="flex items-center gap-2" title={weather.shortForecast}>
                        <WeatherIcon className="w-4 h-4 text-blue-500" />
                        <span className="text-foreground font-medium">
                          {weather.temperature}°{weather.temperatureUnit}
                        </span>
                        <span className="text-muted-foreground text-sm hidden sm:inline">
                          {weather.shortForecast}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>

            {/* Day Overload Warning */}
            {(() => {
              const timeEstimate = estimateDayTime(day);
              if (timeEstimate.warningMessage) {
                return (
                  <div className={`flex items-start gap-3 p-4 rounded-lg border ${
                    timeEstimate.isOverloaded
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-blue-500/10 border-blue-500/30'
                  }`}>
                    <Warning className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                      timeEstimate.isOverloaded ? 'text-amber-500' : 'text-blue-500'
                    }`} />
                    <div>
                      <p className={`text-sm font-medium ${
                        timeEstimate.isOverloaded ? 'text-amber-700 dark:text-amber-400' : 'text-blue-700 dark:text-blue-400'
                      }`}>
                        {timeEstimate.isOverloaded ? 'Ambitious Schedule' : 'Heads Up'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {timeEstimate.warningMessage}
                      </p>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Stops List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-display font-semibold text-foreground">Stops</h3>
                <Button variant="outline" size="sm" onClick={() => setAddStopModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Hike
                </Button>
              </div>

              {day.stops.map((stop, index) => {
                const Icon = getIcon(stop.type);
                const typeStyles = getTypeStyles(stop.type);

                return (
                  <Card
                    key={stop.id}
                    className="group hover:border-primary/30 transition-all"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center gap-1">
                          <div
                            className={`flex items-center justify-center w-10 h-10 rounded-lg border ${typeStyles}`}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <span className="text-xs text-muted-foreground font-medium">
                            {index + 1}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-semibold text-foreground">{stop.name}</h4>
                              <p className="text-sm text-muted-foreground mt-0.5">
                                {stop.description}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {stop.type === 'hike' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-primary hover:bg-primary/10"
                                  onClick={() => handleOpenHikeSwap(stop)}
                                  title="Choose different hike"
                                >
                                  <ArrowsClockwise className="w-4 h-4" />
                                </Button>
                              )}
                              {stop.type === 'camp' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-amber-600 hover:bg-amber-500/10"
                                  onClick={() => handleOpenCampsiteSwap(stop)}
                                  title="Choose different campsite"
                                >
                                  <ArrowsClockwise className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                onClick={() => handleRemoveStop(stop)}
                                title="Remove stop"
                              >
                                <Trash className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {stop.duration}
                            </span>
                            {stop.type === 'hike' && estimateTrailLength(stop.duration) && (
                              <span className="flex items-center gap-1">
                                <Mountains className="w-3.5 h-3.5" />
                                {estimateTrailLength(stop.duration)}
                              </span>
                            )}
                            {stop.distance && (
                              <span className="flex items-center gap-1">
                                <Path className="w-3.5 h-3.5" />
                                {stop.distance}
                              </span>
                            )}
                            {stop.drivingTime && (
                              <span className="flex items-center gap-1 text-primary">
                                <NavigationArrow className="w-3.5 h-3.5" />
                                {stop.drivingTime}
                              </span>
                            )}
                            {stop.rating && (
                              <span className="flex items-center gap-1">
                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                {stop.rating.toFixed(1)}
                              </span>
                            )}
                            {stop.type === 'hike' && (
                              <a
                                href={getAllTrailsUrl(stop.name, stop.coordinates.lat, stop.coordinates.lng)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 hover:underline"
                              >
                                <ArrowSquareOut className="w-3.5 h-3.5" />
                                AllTrails
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {day.stops.length === 0 && (
                <Card>
                  <CardContent className="p-8 text-center">
                    <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No stops planned for this day</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Day Navigation */}
            <div className="flex gap-3 pt-4">
              {dayNum > 1 && (
                <Link to={getDayUrl(generatedTrip.config.name, dayNum - 1)} className="flex-1">
                  <Button variant="outline" className="w-full">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Day {dayNum - 1}
                  </Button>
                </Link>
              )}
              {dayNum < generatedTrip.days.length && (
                <Link to={getDayUrl(generatedTrip.config.name, dayNum + 1)} className="flex-1">
                  <Button variant="outline" className="w-full">
                    Day {dayNum + 1}
                    <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Alternative Hikes Modal */}
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

      {/* Add Stop Modal */}
      <AddStopModal
        isOpen={addStopModalOpen}
        onClose={() => setAddStopModalOpen(false)}
        dayNumber={dayNum}
        searchLat={mainDestination?.coordinates.lat || mapCenter.lat}
        searchLng={mainDestination?.coordinates.lng || mapCenter.lng}
        existingStopIds={day.stops.map(s => s.placeId || s.id).filter(Boolean)}
        onAddStop={handleAddStop}
      />

      {/* Alternative Campsites Modal */}
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
