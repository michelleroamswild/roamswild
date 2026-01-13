import { useState, useEffect } from 'react';
import { X, MapPin, SpinnerGap, Tent, Check, ArrowSquareOut, Cloud, Sun, CloudRain, Snowflake, Wind } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { TripStop } from '@/types/trip';

// NOAA Weather types
interface WeatherForecast {
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
  icon: string;
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
      icon: current.icon,
    };

    // Cache the result
    weatherCache.set(cacheKey, weather);
    return weather;
  } catch (error) {
    console.error('Weather fetch error:', error);
    return null;
  }
}

interface AlternativeCampsitesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCampsite: TripStop;
  searchLat: number;
  searchLng: number;
  onSelectCampsite: (campsite: TripStop) => void;
}

interface CampsiteOption {
  id: string;
  name: string;
  note?: string;
  lat: number;
  lng: number;
  distance: number;
  source: 'saved' | 'ridb';
}

// Haversine formula to calculate distance between two points in miles
function getDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// RIDB API key
const RIDB_API_KEY = import.meta.env.VITE_RIDB_API_KEY || '';

interface RIDBFacility {
  FacilityID: string;
  FacilityName: string;
  FacilityDescription: string;
  FacilityLatitude: number;
  FacilityLongitude: number;
  FacilityTypeDescription: string;
}

// Search RIDB for campsites
async function searchRIDBCampsites(
  lat: number,
  lng: number,
  radiusMiles: number = 50
): Promise<CampsiteOption[]> {
  if (!RIDB_API_KEY) {
    return [];
  }

  try {
    const url = `/api/ridb/facilities?latitude=${lat}&longitude=${lng}&radius=${radiusMiles}&limit=50`;

    const response = await fetch(url, {
      headers: {
        'apikey': RIDB_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const facilities: RIDBFacility[] = data.RECDATA || [];

    const campgroundTypes = ['campground', 'camping', 'camp'];
    const campgrounds = facilities.filter(f => {
      if (!f.FacilityLatitude || !f.FacilityLongitude) return false;
      const typeDesc = (f.FacilityTypeDescription || '').toLowerCase();
      const name = (f.FacilityName || '').toLowerCase();
      return campgroundTypes.some(type => typeDesc.includes(type) || name.includes(type));
    });

    return campgrounds
      .map((facility) => {
        const distance = getDistanceMiles(lat, lng, facility.FacilityLatitude, facility.FacilityLongitude);
        const cleanDescription = facility.FacilityDescription
          ?.replace(/<[^>]*>/g, '')
          ?.slice(0, 150) || facility.FacilityTypeDescription;
        return {
          id: `ridb-${facility.FacilityID}`,
          name: facility.FacilityName,
          lat: facility.FacilityLatitude,
          lng: facility.FacilityLongitude,
          note: cleanDescription,
          distance,
          source: 'ridb' as const,
        };
      })
      .sort((a, b) => a.distance - b.distance);
  } catch {
    return [];
  }
}

// Load saved campsites from JSON file
async function loadSavedCampsites(): Promise<CampsiteOption[]> {
  try {
    const res = await fetch('/google-saved-places.json');
    if (!res.ok) return [];
    const places = await res.json();
    return places.map((place: any) => ({
      id: place.id || `saved-${place.name}`,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      note: place.note,
      distance: 0,
      source: 'saved' as const,
    }));
  } catch {
    return [];
  }
}

// Find alternative campsites near a location
async function findAlternativeCampsites(
  lat: number,
  lng: number,
  excludeId?: string,
  radiusMiles: number = 50
): Promise<CampsiteOption[]> {
  // Load saved campsites
  const savedCampsites = await loadSavedCampsites();

  // Calculate distances and filter by radius
  const nearbySaved = savedCampsites
    .map(site => ({
      ...site,
      distance: getDistanceMiles(lat, lng, site.lat, site.lng),
    }))
    .filter(site => site.distance <= radiusMiles && site.id !== excludeId)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  // Also search RIDB
  const ridbCampsites = await searchRIDBCampsites(lat, lng, radiusMiles);
  const nearbyRidb = ridbCampsites
    .filter(site => site.id !== excludeId)
    .slice(0, 5);

  // Combine and sort by distance
  return [...nearbySaved, ...nearbyRidb]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8);
}

export function AlternativeCampsitesModal({
  isOpen,
  onClose,
  currentCampsite,
  searchLat,
  searchLng,
  onSelectCampsite,
}: AlternativeCampsitesModalProps) {
  const [alternatives, setAlternatives] = useState<CampsiteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setSelectedId(null);
      findAlternativeCampsites(searchLat, searchLng, currentCampsite.id).then((sites) => {
        setAlternatives(sites);
        setLoading(false);
      });
    }
  }, [isOpen, searchLat, searchLng, currentCampsite.id]);

  const handleSelect = (campsite: CampsiteOption) => {
    const newStop: TripStop = {
      id: campsite.id,
      name: campsite.name,
      type: 'camp',
      coordinates: { lat: campsite.lat, lng: campsite.lng },
      duration: 'Overnight',
      distance: `${campsite.distance.toFixed(0)} mi away`,
      description: campsite.note || 'Dispersed camping',
      day: currentCampsite.day,
      note: campsite.note,
    };
    setSelectedId(campsite.id);
    setTimeout(() => {
      onSelectCampsite(newStop);
      onClose();
    }, 300);
  };

  // Generate Google Maps link for a campsite
  const getGoogleMapsUrl = (campsite: CampsiteOption) => {
    return `https://www.google.com/maps/search/?api=1&query=${campsite.lat},${campsite.lng}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-card rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-display font-semibold text-foreground">
            Change Campsite
          </h2>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
            <X className="w-5 h-5" weight="bold" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {/* Current Campsite */}
          <div className="mb-4 p-4 rounded-xl border-2 border-primary bg-primary/5">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary text-primary-foreground">
                <Tent className="w-5 h-5" weight="bold" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-foreground">{currentCampsite.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                    Current
                  </span>
                </div>
                {currentCampsite.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {currentCampsite.description}
                  </p>
                )}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${currentCampsite.coordinates.lat},${currentCampsite.coordinates.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-primary hover:underline mt-2"
                >
                  <ArrowSquareOut className="w-3.5 h-3.5" />
                  View on Maps
                </a>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-3">Other options nearby:</p>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <SpinnerGap className="w-8 h-8 text-primary animate-spin mb-3" />
              <p className="text-muted-foreground">Finding nearby campsites...</p>
            </div>
          ) : alternatives.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Tent className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No alternative campsites found nearby</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alternatives.map((campsite) => (
                <button
                  key={campsite.id}
                  onClick={() => handleSelect(campsite)}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                    selectedId === campsite.id
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/30 hover:bg-secondary/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                        selectedId === campsite.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-softamber/20 text-softamber'
                      }`}
                    >
                      {selectedId === campsite.id ? (
                        <Check className="w-5 h-5" weight="bold" />
                      ) : (
                        <Tent className="w-5 h-5" weight="bold" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium text-foreground">{campsite.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                          campsite.source === 'saved'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-blue-500/10 text-blue-600'
                        }`}>
                          {campsite.source === 'saved' ? 'Saved' : 'RIDB'}
                        </span>
                      </div>
                      {campsite.note && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {campsite.note}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{campsite.distance.toFixed(1)} mi away</span>
                        </div>
                        <a
                          href={getGoogleMapsUrl(campsite)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <ArrowSquareOut className="w-3.5 h-3.5" />
                          View on Maps
                        </a>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-secondary/30">
          <p className="text-xs text-muted-foreground text-center">
            Click on a campsite to select it • Saved spots from your places, RIDB from Recreation.gov
          </p>
        </div>
      </div>
    </div>
  );
}
