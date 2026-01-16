import { useState, useEffect } from 'react';
import { X, MapPin, SpinnerGap, Tent, Check, ArrowSquareOut, Cloud, Sun, CloudRain, Snowflake, Wind } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { TripStop } from '@/types/trip';
import { useCampsites } from '@/context/CampsitesContext';

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

type LodgingType = 'dispersed' | 'campground' | 'cabin' | 'hotel' | 'mixed' | 'other';

interface AlternativeCampsitesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCampsite: TripStop;
  searchLat: number;
  searchLng: number;
  onSelectCampsite: (campsite: TripStop) => void;
  tripStartDate?: string; // ISO date string for availability checking
  tripDuration?: number; // Number of nights
  lodgingPreference?: LodgingType; // Only search RIDB if not 'dispersed'
}

interface CampsiteOption {
  id: string;
  name: string;
  note?: string;
  lat: number;
  lng: number;
  distance: number;
  source: 'saved' | 'ridb' | 'usfs' | 'osm';
  hasAvailability?: boolean;
  availableSites?: number;
  bookingUrl?: string;
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

interface RIDBFacility {
  FacilityID: string;
  FacilityName: string;
  FacilityDescription: string;
  FacilityLatitude: number;
  FacilityLongitude: number;
  FacilityTypeDescription: string;
}

// Search RIDB for campsites via Vite proxy
async function searchRIDBCampsites(
  lat: number,
  lng: number,
  radiusMiles: number = 50
): Promise<CampsiteOption[]> {
  try {
    // Use local Vite proxy for RIDB API (proxies to ridb.recreation.gov with API key)
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      radius: radiusMiles.toString(),
      limit: '50',
    });

    console.log(`[AlternativeCampsites] Fetching RIDB facilities near ${lat}, ${lng}`);
    const response = await fetch(`/api/ridb/facilities?${params}`);

    if (!response.ok) {
      console.error('[AlternativeCampsites] RIDB API error:', response.status);
      return [];
    }

    const data = await response.json();
    const facilities: RIDBFacility[] = data.RECDATA || [];
    console.log(`[AlternativeCampsites] RIDB returned ${facilities.length} facilities`);

    const campgroundTypes = ['campground', 'camping', 'camp'];
    const campgrounds = facilities.filter(f => {
      if (!f.FacilityLatitude || !f.FacilityLongitude) return false;
      const typeDesc = (f.FacilityTypeDescription || '').toLowerCase();
      const name = (f.FacilityName || '').toLowerCase();
      return campgroundTypes.some(type => typeDesc.includes(type) || name.includes(type));
    });

    console.log(`[AlternativeCampsites] Filtered to ${campgrounds.length} campgrounds`);

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
          bookingUrl: `https://www.recreation.gov/camping/campgrounds/${facility.FacilityID}`,
        };
      })
      .sort((a, b) => a.distance - b.distance);
  } catch (error) {
    console.error('[AlternativeCampsites] RIDB search error:', error);
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

// Check availability for RIDB campsites via Vite proxy to Recreation.gov
async function checkAvailability(
  facilityIds: string[],
  startDate: string,
  numNights: number
): Promise<Map<string, { available: boolean; availableSites: number }>> {
  const availabilityMap = new Map<string, { available: boolean; availableSites: number }>();

  if (facilityIds.length === 0 || !startDate) {
    return availabilityMap;
  }

  console.log(`[AlternativeCampsites] Checking availability for ${facilityIds.length} campgrounds`);

  try {
    // Parse the start date to get the month
    const [year, month, day] = startDate.split('-').map(Number);
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;

    // Check each facility
    for (const facilityId of facilityIds) {
      try {
        const numericId = facilityId.replace('ridb-', '');
        const params = new URLSearchParams({ id: numericId, start_date: monthStart });
        const response = await fetch(`/api/recreation-availability?${params}`);

        if (!response.ok) {
          console.log(`[AlternativeCampsites] Availability check failed for ${numericId}: ${response.status}`);
          continue;
        }

        const data = await response.json();

        if (data.campsites) {
          const campsites = Object.values(data.campsites) as any[];
          let sitesWithAvailability = 0;

          // Log sample of what statuses exist for debugging
          if (campsites.length > 0 && campsites[0].availabilities) {
            const sampleStatuses = new Set<string>();
            const checkDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`;
            campsites.slice(0, 10).forEach((site: any) => {
              if (site.availabilities && site.availabilities[checkDateStr]) {
                sampleStatuses.add(site.availabilities[checkDateStr]);
              }
            });
            console.log(`[AlternativeCampsites] ${numericId} statuses for ${checkDateStr}:`, Array.from(sampleStatuses));
          }

          // Check each campsite for availability on our dates
          for (const site of campsites) {
            if (site.availabilities) {
              let hasAllNights = true;

              // Check each night
              const checkDate = new Date(year, month - 1, day);
              for (let i = 0; i < numNights; i++) {
                const y = checkDate.getFullYear();
                const m = String(checkDate.getMonth() + 1).padStart(2, '0');
                const d = String(checkDate.getDate()).padStart(2, '0');
                const dateKey = `${y}-${m}-${d}T00:00:00Z`;

                const status = site.availabilities[dateKey];
                // Recreation.gov uses "Available" for bookable sites, "Open" for walk-up
                const isAvailable = status === 'Available' || status === 'Open';

                if (!isAvailable) {
                  hasAllNights = false;
                  break;
                }
                checkDate.setDate(checkDate.getDate() + 1);
              }

              if (hasAllNights) {
                sitesWithAvailability++;
              }
            }
          }

          availabilityMap.set(facilityId, {
            available: sitesWithAvailability > 0,
            availableSites: sitesWithAvailability,
          });

          console.log(`[AlternativeCampsites] ${numericId}: ${sitesWithAvailability}/${campsites.length} sites available for ${startDate}`);
        }
      } catch (err) {
        console.error(`[AlternativeCampsites] Error checking ${facilityId}:`, err);
      }
    }

    return availabilityMap;
  } catch (error) {
    console.error('[AlternativeCampsites] Availability check error:', error);
    return availabilityMap;
  }
}

// Find alternative campsites near a location
// For 'dispersed' lodging, dispersedCampsites should be passed from the context
async function findAlternativeCampsites(
  lat: number,
  lng: number,
  excludeId?: string,
  radiusMiles: number = 50,
  tripStartDate?: string,
  tripDuration?: number,
  lodgingPreference?: LodgingType,
  dispersedCampsites?: CampsiteOption[]
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

  // For dispersed camping, use the dispersed campsites database instead of RIDB
  if (lodgingPreference === 'dispersed') {
    console.log(`[findAlternativeCampsites] Using dispersed campsites (${dispersedCampsites?.length || 0} available)`);

    // Filter and sort dispersed campsites
    const nearbyDispersed = (dispersedCampsites || [])
      .map(site => ({
        ...site,
        distance: getDistanceMiles(lat, lng, site.lat, site.lng),
        source: 'osm' as const,
      }))
      .filter(site => site.distance <= radiusMiles && site.id !== excludeId)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);

    // Return dispersed spots first, then saved spots
    return [...nearbyDispersed, ...nearbySaved].slice(0, 10);
  }

  // For established camping (campground, cabin, hotel, etc.), search RIDB
  const ridbCampsites = await searchRIDBCampsites(lat, lng, radiusMiles);
  let nearbyRidb = ridbCampsites
    .filter(site => site.id !== excludeId)
    .slice(0, 15); // Get more to account for availability filtering

  // Check availability for RIDB campsites if trip dates provided
  console.log(`[findAlternativeCampsites] tripStartDate=${tripStartDate}, tripDuration=${tripDuration}, ridbCount=${nearbyRidb.length}`);
  if (tripStartDate && tripDuration && nearbyRidb.length > 0) {
    const ridbIds = nearbyRidb.map(c => c.id);
    console.log(`[findAlternativeCampsites] Checking availability for:`, ridbIds);
    const availabilityMap = await checkAvailability(ridbIds, tripStartDate, tripDuration);
    console.log(`[findAlternativeCampsites] Availability results:`, Array.from(availabilityMap.entries()));

    // Update campsites with availability info
    nearbyRidb = nearbyRidb.map(site => {
      const availability = availabilityMap.get(site.id);
      if (availability) {
        return {
          ...site,
          hasAvailability: availability.available,
          availableSites: availability.availableSites,
          bookingUrl: `https://www.recreation.gov/camping/campgrounds/${site.id.replace('ridb-', '')}`,
        };
      }
      return site;
    });

    // Filter out campsites with no availability - only show available ones
    nearbyRidb = nearbyRidb.filter(s => s.hasAvailability !== false);

    // Sort by distance (all remaining have availability or unknown)
    nearbyRidb.sort((a, b) => a.distance - b.distance);

    console.log(`[findAlternativeCampsites] ${nearbyRidb.length} RIDB campsites with availability for ${tripStartDate}`);
  }

  // Combine: RIDB with availability first, then saved spots
  // Only include RIDB campsites that have confirmed availability
  const withAvailability = nearbyRidb.filter(s => s.hasAvailability === true);
  const unknownAvailability = nearbyRidb.filter(s => s.hasAvailability === undefined);

  // Return available RIDB first, then saved spots, then unknown availability RIDB
  return [...withAvailability, ...nearbySaved, ...unknownAvailability]
    .slice(0, 10);
}

export function AlternativeCampsitesModal({
  isOpen,
  onClose,
  currentCampsite,
  searchLat,
  searchLng,
  onSelectCampsite,
  tripStartDate,
  tripDuration,
  lodgingPreference,
}: AlternativeCampsitesModalProps) {
  const [alternatives, setAlternatives] = useState<CampsiteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Get dispersed campsites from context for dispersed camping mode
  const { getExplorerSpots } = useCampsites();

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setSelectedId(null);

      // For dispersed camping, first fetch dispersed spots from database
      const fetchAlternatives = async () => {
        let dispersedCampsites: CampsiteOption[] | undefined;

        if (lodgingPreference === 'dispersed') {
          try {
            const spots = await getExplorerSpots(searchLat, searchLng, 50);
            dispersedCampsites = spots.map(spot => ({
              id: spot.id,
              name: spot.name,
              lat: spot.lat,
              lng: spot.lng,
              note: spot.description || spot.road_type || 'Dispersed camping spot',
              distance: 0, // Will be calculated in findAlternativeCampsites
              source: 'osm' as const,
            }));
            console.log(`[AlternativeCampsitesModal] Loaded ${dispersedCampsites.length} dispersed spots from database`);
          } catch (err) {
            console.error('[AlternativeCampsitesModal] Error loading dispersed spots:', err);
          }
        }

        const sites = await findAlternativeCampsites(
          searchLat,
          searchLng,
          currentCampsite.id,
          50,
          tripStartDate,
          tripDuration,
          lodgingPreference,
          dispersedCampsites
        );
        setAlternatives(sites);
        setLoading(false);
      };

      fetchAlternatives();
    }
  }, [isOpen, searchLat, searchLng, currentCampsite.id, tripStartDate, tripDuration, lodgingPreference, getExplorerSpots]);

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
      bookingUrl: campsite.bookingUrl,
      isReservable: campsite.hasAvailability,
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

          {!tripStartDate && lodgingPreference !== 'dispersed' && (
            <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Set trip dates to see campsite availability
              </p>
            </div>
          )}

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
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {campsite.hasAvailability === true && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">
                              {campsite.availableSites} sites
                            </span>
                          )}
                          {campsite.hasAvailability === false && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">
                              No availability
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            campsite.source === 'saved'
                              ? 'bg-primary/10 text-primary'
                              : 'bg-blue-500/10 text-blue-600'
                          }`}>
                            {campsite.source === 'saved' ? 'Saved' : 'RIDB'}
                          </span>
                        </div>
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
                        {campsite.bookingUrl && (
                          <a
                            href={campsite.bookingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                          >
                            <ArrowSquareOut className="w-3.5 h-3.5" />
                            Book on Recreation.gov
                          </a>
                        )}
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
