import { useState, useCallback } from 'react';
import { TripConfig, GeneratedTrip, TripDay, TripStop, TripDestination } from '@/types/trip';
import { GoogleSavedPlace } from './use-nearby-places';

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

// Find midpoint between two coordinates
function getMidpoint(lat1: number, lng1: number, lat2: number, lng2: number) {
  return {
    lat: (lat1 + lat2) / 2,
    lng: (lng1 + lng2) / 2,
  };
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

// Search RIDB for campsites near a location
async function searchRIDBCampsites(
  lat: number,
  lng: number,
  radiusMiles: number = 50
): Promise<(GoogleSavedPlace & { distance: number })[]> {
  if (!RIDB_API_KEY) {
    console.log('RIDB API key not configured');
    return [];
  }

  try {
    // Use proxy to avoid CORS issues
    const url = `/api/ridb/facilities?latitude=${lat}&longitude=${lng}&radius=${radiusMiles}&limit=100`;

    console.log('Fetching RIDB campsites:', url);

    const response = await fetch(url, {
      headers: {
        'apikey': RIDB_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('RIDB API error:', response.status, await response.text());
      return [];
    }

    const data = await response.json();
    const facilities: RIDBFacility[] = data.RECDATA || [];

    console.log(`RIDB returned ${facilities.length} facilities`);

    // Filter to only include campgrounds
    const campgroundTypes = ['campground', 'camping', 'camp'];
    const campgrounds = facilities.filter(f => {
      if (!f.FacilityLatitude || !f.FacilityLongitude) return false;
      const typeDesc = (f.FacilityTypeDescription || '').toLowerCase();
      const name = (f.FacilityName || '').toLowerCase();
      return campgroundTypes.some(type => typeDesc.includes(type) || name.includes(type));
    });

    console.log(`Found ${campgrounds.length} campgrounds from RIDB`);

    return campgrounds
      .map((facility) => {
        const distance = getDistanceMiles(lat, lng, facility.FacilityLatitude, facility.FacilityLongitude);
        // Clean up the description - remove HTML tags
        const cleanDescription = facility.FacilityDescription
          ?.replace(/<[^>]*>/g, '')
          ?.slice(0, 200) || facility.FacilityTypeDescription;
        return {
          id: `ridb-${facility.FacilityID}`,
          name: facility.FacilityName,
          lat: facility.FacilityLatitude,
          lng: facility.FacilityLongitude,
          note: cleanDescription,
          distance,
        };
      })
      .sort((a, b) => a.distance - b.distance);
  } catch (error) {
    console.error('RIDB search error:', error);
    return [];
  }
}

// Find campsites near a point
// When lodgingPreference is 'established', use RIDB for official campgrounds
// When lodgingPreference is 'dispersed', use saved places with RIDB fallback
async function findNearbyCampsites(
  lat: number,
  lng: number,
  allCampsites: GoogleSavedPlace[],
  radiusMiles: number = 50,
  lodgingPreference: 'dispersed' | 'established' = 'dispersed'
): Promise<(GoogleSavedPlace & { distance: number })[]> {
  // For established camping, use RIDB directly to get official campgrounds
  if (lodgingPreference === 'established') {
    console.log('[findNearbyCampsites] Using RIDB for established campgrounds');
    const ridbCampsites = await searchRIDBCampsites(lat, lng, radiusMiles);
    if (ridbCampsites.length > 0) {
      return ridbCampsites;
    }
    // If no RIDB results, fall back to saved campsites
    console.log('[findNearbyCampsites] No RIDB results, falling back to saved campsites');
  }

  // For dispersed camping (or as fallback), try saved campsites first
  const campsitesWithDistance = allCampsites.map((site) => ({
    ...site,
    distance: getDistanceMiles(lat, lng, site.lat, site.lng),
  }));

  const savedCampsites = campsitesWithDistance
    .filter((site) => site.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);

  // If we have saved campsites, use them
  if (savedCampsites.length > 0) {
    return savedCampsites;
  }

  // Fallback to RIDB API
  const ridbCampsites = await searchRIDBCampsites(lat, lng, radiusMiles);
  return ridbCampsites;
}

// Get actual driving distance and time between two points
interface DrivingInfo {
  distanceMiles: number;
  durationMinutes: number;
  isReachable: boolean;
}

async function getDrivingInfo(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  destName?: string
): Promise<DrivingInfo> {
  // Fallback values using straight-line distance with mountain road multiplier
  const straightLineDistance = getDistanceMiles(originLat, originLng, destLat, destLng);
  // In mountainous areas, roads can be 2-4x longer than straight line
  // Use 2.5x as a conservative estimate for mountain/rural areas
  const estimatedRoadDistance = straightLineDistance * 2.5;
  const fallback: DrivingInfo = {
    distanceMiles: estimatedRoadDistance,
    durationMinutes: Math.round((estimatedRoadDistance / 30) * 60), // Estimate 30mph on mountain roads
    isReachable: true,
  };

  if (!window.google?.maps) {
    console.log(`[getDrivingInfo] Google Maps not loaded, using fallback for ${destName || 'destination'}`);
    return fallback;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log(`[getDrivingInfo] Timeout for ${destName || 'destination'}, using fallback: ${Math.round(estimatedRoadDistance)} mi`);
      resolve(fallback);
    }, 8000); // Increased timeout

    try {
      const directionsService = new google.maps.DirectionsService();

      directionsService.route(
        {
          origin: { lat: originLat, lng: originLng },
          destination: { lat: destLat, lng: destLng },
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          clearTimeout(timeout);
          if (status === google.maps.DirectionsStatus.OK && result?.routes[0]?.legs[0]) {
            const leg = result.routes[0].legs[0];
            const miles = (leg.distance?.value || 0) / 1609.34;
            const mins = (leg.duration?.value || 0) / 60;
            console.log(`[getDrivingInfo] SUCCESS for ${destName || 'destination'}: ${Math.round(miles)} mi, ${Math.round(mins)} min`);
            resolve({
              distanceMiles: miles,
              durationMinutes: mins,
              isReachable: true,
            });
          } else if (status === google.maps.DirectionsStatus.ZERO_RESULTS) {
            console.log(`[getDrivingInfo] No route for ${destName || 'destination'}`);
            resolve({ ...fallback, isReachable: false });
          } else {
            console.log(`[getDrivingInfo] API status ${status} for ${destName || 'destination'}, using fallback: ${Math.round(estimatedRoadDistance)} mi`);
            resolve(fallback);
          }
        }
      );
    } catch (err) {
      clearTimeout(timeout);
      console.error(`[getDrivingInfo] Error for ${destName || 'destination'}:`, err);
      resolve(fallback);
    }
  });
}

// Check if a location is reachable by driving from an origin (legacy function for compatibility)
async function isReachableByDriving(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<boolean> {
  const info = await getDrivingInfo(originLat, originLng, destLat, destLng);
  return info.isReachable;
}

// Find hikes near a point using Google Places, filtered by actual driving time
// maxDrivingMinutes: maximum one-way driving time to consider (default 60 min)
async function findNearbyHikes(
  lat: number,
  lng: number,
  radiusMeters: number = 48280,
  maxDrivingMinutes: number = 60
): Promise<TripStop[]> {
  if (!window.google?.maps?.places) return [];

  return new Promise((resolve) => {
    const service = new google.maps.places.PlacesService(document.createElement('div'));

    const request: google.maps.places.PlaceSearchRequest = {
      location: new google.maps.LatLng(lat, lng),
      radius: radiusMeters,
      keyword: 'hiking trail',
      type: 'tourist_attraction',
    };

    service.nearbySearch(request, async (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const candidates = results
          .filter((place) => place.geometry?.location)
          .slice(0, 10); // Limit candidates to avoid too many API calls

        console.log(`[findNearbyHikes] Found ${candidates.length} candidates, checking driving distances...`);

        // Get actual driving info for each candidate
        const hikesWithDrivingInfo: TripStop[] = [];

        for (const place of candidates) {
          if (hikesWithDrivingInfo.length >= 5) break; // Stop once we have enough

          // Add small delay between API calls to avoid rate limiting
          if (hikesWithDrivingInfo.length > 0) {
            await new Promise(r => setTimeout(r, 200));
          }

          const drivingInfo = await getDrivingInfo(
            lat, lng,
            place.geometry!.location!.lat(),
            place.geometry!.location!.lng(),
            place.name // Pass name for logging
          );

          // Filter out unreachable or too-far hikes
          if (!drivingInfo.isReachable) {
            console.log(`[findNearbyHikes] Filtered unreachable: ${place.name}`);
            continue;
          }

          if (drivingInfo.durationMinutes > maxDrivingMinutes) {
            console.log(`[findNearbyHikes] Filtered too far (${Math.round(drivingInfo.durationMinutes)} min, ${Math.round(drivingInfo.distanceMiles)} mi): ${place.name}`);
            continue;
          }

          // Format driving time string
          const mins = Math.round(drivingInfo.durationMinutes);
          const drivingTimeStr = mins < 60
            ? `${mins} min each way`
            : `${Math.floor(mins / 60)}h ${mins % 60}m each way`;

          console.log(`[findNearbyHikes] INCLUDED: ${place.name} - ${Math.round(drivingInfo.distanceMiles)} mi, ${mins} min`);

          hikesWithDrivingInfo.push({
            id: `hike-${place.place_id}`,
            name: place.name || 'Unknown Trail',
            type: 'hike' as const,
            coordinates: {
              lat: place.geometry!.location!.lat(),
              lng: place.geometry!.location!.lng(),
            },
            duration: '2-4h hike',
            distance: `${Math.round(drivingInfo.distanceMiles)} mi drive`,
            drivingTime: drivingTimeStr,
            description: place.vicinity || '',
            day: 0,
            placeId: place.place_id,
            rating: place.rating,
            reviewCount: place.user_ratings_total,
          });
        }

        // Sort by driving time (closest first)
        hikesWithDrivingInfo.sort((a, b) => {
          const aTime = parseInt(a.drivingTime?.split(' ')[0] || '0');
          const bTime = parseInt(b.drivingTime?.split(' ')[0] || '0');
          return aTime - bTime;
        });

        if (hikesWithDrivingInfo.length === 0) {
          console.log('[findNearbyHikes] No hikes found within driving time limit. Returning hikes with accurate distances but marked as far.');
          // Instead of using estimated distances, get accurate distances for the closest candidates
          // but mark them clearly as being far away
          const farHikes: TripStop[] = [];
          for (const place of candidates.slice(0, 5)) {
            const drivingInfo = await getDrivingInfo(
              lat, lng,
              place.geometry!.location!.lat(),
              place.geometry!.location!.lng(),
              place.name
            );

            if (!drivingInfo.isReachable) continue;

            const mins = Math.round(drivingInfo.durationMinutes);
            const drivingTimeStr = mins < 60
              ? `${mins} min each way`
              : `${Math.floor(mins / 60)}h ${mins % 60}m each way`;

            farHikes.push({
              id: `hike-${place.place_id}`,
              name: place.name || 'Unknown Trail',
              type: 'hike' as const,
              coordinates: {
                lat: place.geometry!.location!.lat(),
                lng: place.geometry!.location!.lng(),
              },
              duration: '2-4h hike',
              distance: `${Math.round(drivingInfo.distanceMiles)} mi drive`,
              drivingTime: drivingTimeStr,
              description: place.vicinity || '',
              day: 0,
              placeId: place.place_id,
              rating: place.rating,
              reviewCount: place.user_ratings_total,
            });
          }
          // Sort by driving time
          farHikes.sort((a, b) => {
            const aMatch = a.drivingTime?.match(/(\d+)/);
            const bMatch = b.drivingTime?.match(/(\d+)/);
            return (aMatch ? parseInt(aMatch[1]) : 999) - (bMatch ? parseInt(bMatch[1]) : 999);
          });
          resolve(farHikes);
        } else {
          resolve(hikesWithDrivingInfo);
        }
      } else {
        console.log('[findNearbyHikes] Places API returned:', status);
        resolve([]);
      }
    });
  });
}

// Load all campsites from JSON
async function loadAllCampsites(): Promise<GoogleSavedPlace[]> {
  try {
    const res = await fetch('/google-saved-places.json');
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export function useTripGenerator() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate a location-based trip (explore around a single location)
  const generateLocationBasedTrip = useCallback(async (config: TripConfig): Promise<GeneratedTrip | null> => {
    if (!config.baseLocation) {
      setError('Please provide a base location');
      return null;
    }

    setGenerating(true);
    setError(null);

    try {
      const allCampsites = await loadAllCampsites();
      const baseLocation = config.baseLocation;
      const numDays = config.duration;
      const activitiesPerDay = config.activitiesPerDay || 1;

      const days: TripDay[] = [];
      let totalDistanceMiles = 0;
      const usedHikeIds = new Set<string>();
      const usedCampIds = new Set<string>();
      const sameCampsite = config.sameCampsite || false;

      // Find all nearby campsites and hikes upfront
      const lodgingPref = config.lodgingPreference || 'dispersed';
      console.log('Searching for campsites within 50 miles of:', baseLocation.name, baseLocation.coordinates, 'lodging:', lodgingPref);
      const nearbyCamps = await findNearbyCampsites(
        baseLocation.coordinates.lat,
        baseLocation.coordinates.lng,
        allCampsites,
        50,
        lodgingPref
      );
      console.log('Found nearby camps:', nearbyCamps.length, nearbyCamps.slice(0, 3).map(c => c.name));

      // If same campsite option, pick the best one upfront
      let fixedCampsite: TripStop | undefined;
      if (sameCampsite && nearbyCamps.length > 0) {
        const bestCamp = nearbyCamps[0];
        const campTypeDesc = lodgingPref === 'established' ? 'Established campground (base camp)' : 'Dispersed camping (base camp)';
        fixedCampsite = {
          id: `camp-base`,
          name: bestCamp.name,
          type: 'camp',
          coordinates: { lat: bestCamp.lat, lng: bestCamp.lng },
          duration: 'Overnight',
          distance: `${bestCamp.distance.toFixed(1)} mi from ${baseLocation.name}`,
          description: bestCamp.note || campTypeDesc,
          day: 1,
          note: bestCamp.note,
        };
      }

      // Determine which days should have hikes based on pace preference
      const hikingPreference = config.hikingPreference || 'daily';
      const pacePreference = config.pacePreference || 'moderate';
      let hikingDays: Set<number> = new Set();

      // If hiking preference is 'none', skip all hiking regardless of pace
      if (hikingPreference !== 'none') {
        // Determine hiking frequency based on pace
        let hikingPercentage: number;
        if (pacePreference === 'packed') {
          hikingPercentage = 1.0; // 100% - hike every day
        } else if (pacePreference === 'moderate') {
          hikingPercentage = 0.6; // 60% of days
        } else {
          hikingPercentage = 0.3; // 30% of days (relaxed)
        }

        const numHikingDays = Math.max(1, Math.round(numDays * hikingPercentage));

        if (hikingPercentage >= 1.0) {
          // Hike every day
          for (let d = 1; d <= numDays; d++) hikingDays.add(d);
        } else {
          // Spread hikes evenly across the trip
          const interval = numDays / numHikingDays;
          for (let i = 0; i < numHikingDays; i++) {
            const dayNum = Math.min(numDays, Math.round(1 + i * interval));
            hikingDays.add(dayNum);
          }
        }
        console.log(`[generateLocationBasedTrip] Pace: ${pacePreference}, hiking ${numHikingDays}/${numDays} days`);
      }

      // Pre-fetch all hikes if we need any
      let allNearbyHikes: TripStop[] = [];
      if (hikingPreference !== 'none') {
        console.log(`[generateLocationBasedTrip] Fetching hikes near ${baseLocation.name}...`);
        allNearbyHikes = await findNearbyHikes(
          baseLocation.coordinates.lat,
          baseLocation.coordinates.lng,
          50000 // 50km radius
        );
        console.log(`[generateLocationBasedTrip] Found ${allNearbyHikes.length} hikes after filtering:`);
        allNearbyHikes.forEach(h => console.log(`  - ${h.name}: ${h.distance}, ${h.drivingTime}`));
        // For surprise mode, sort by rating to get best hikes
        if (hikingPreference === 'surprise') {
          allNearbyHikes.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        }
      }

      for (let day = 1; day <= numDays; day++) {
        const dayStops: TripStop[] = [];
        let dayDistanceMiles = 0;

        // Find hikes for this day (only if this day should have hiking)
        const dayHikes: TripStop[] = [];
        const shouldHikeToday = hikingDays.has(day);

        if (shouldHikeToday) {
          // Get unique hikes for this day
          const availableHikes = allNearbyHikes.filter(h => !usedHikeIds.has(h.placeId || h.id));
          console.log(`[generateLocationBasedTrip] Day ${day}: ${availableHikes.length} available hikes`);
          for (let i = 0; i < activitiesPerDay && i < availableHikes.length; i++) {
            // Use the driving info already calculated in findNearbyHikes
            // The hike object already has accurate distance and drivingTime from Google Directions API
            console.log(`[generateLocationBasedTrip] Assigning hike "${availableHikes[i].name}" with distance: ${availableHikes[i].distance}, drivingTime: ${availableHikes[i].drivingTime}`);
            const hike = {
              ...availableHikes[i],
              day,
              id: `hike-${day}-${i}`,
            };
            usedHikeIds.add(availableHikes[i].placeId || availableHikes[i].id);
            dayHikes.push(hike);
            dayStops.push(hike);

            // Extract miles from distance string for totals (e.g., "45 mi drive" -> 45)
            const distanceMatch = availableHikes[i].distance?.match(/(\d+)/);
            const hikeMiles = distanceMatch ? parseInt(distanceMatch[1], 10) : 0;
            dayDistanceMiles += hikeMiles * 2; // Round trip
          }
        }

        // Find campsite for this night
        let campsite: TripStop | undefined;
        if (day < numDays) {
          if (sameCampsite && fixedCampsite) {
            // Use the same campsite every night
            campsite = {
              ...fixedCampsite,
              id: `camp-${day}`,
              day,
              description: fixedCampsite.note || 'Dispersed camping (base camp)',
            };
          } else {
            // Use different campsites each day
            const availableCamps = nearbyCamps.filter(c => !usedCampIds.has(c.id));
            const campToUse = availableCamps.length > 0 ? availableCamps[0] : nearbyCamps[0];

            if (campToUse) {
              usedCampIds.add(campToUse.id);
              const campTypeDesc = lodgingPref === 'established' ? 'Established campground' : 'Dispersed camping';
              campsite = {
                id: `camp-${day}`,
                name: campToUse.name,
                type: 'camp',
                coordinates: { lat: campToUse.lat, lng: campToUse.lng },
                duration: 'Overnight',
                distance: `${campToUse.distance.toFixed(1)} mi from ${baseLocation.name}`,
                description: campToUse.note || campTypeDesc,
                day,
                note: campToUse.note,
              };
            }
          }
          if (campsite) {
            dayStops.push(campsite);
          }
        }

        totalDistanceMiles += dayDistanceMiles;

        // Estimate driving time (20-30 mph on back roads)
        const dayDrivingMinutes = (dayDistanceMiles / 25) * 60;

        days.push({
          day,
          stops: dayStops,
          campsite,
          hike: dayHikes[0], // Primary hike for the day
          drivingDistance: `${Math.round(dayDistanceMiles)} mi`,
          drivingTime: `${Math.round(dayDrivingMinutes / 60)}h ${Math.round(dayDrivingMinutes % 60)}m`,
        });
      }

      const totalDrivingMinutes = (totalDistanceMiles / 25) * 60;

      const generatedTrip: GeneratedTrip = {
        id: `trip-${Date.now()}`,
        config,
        days,
        totalDistance: `${Math.round(totalDistanceMiles)} mi`,
        totalDrivingTime: `${Math.round(totalDrivingMinutes / 60)}h ${Math.round(totalDrivingMinutes % 60)}m`,
        createdAt: new Date().toISOString(),
      };

      setGenerating(false);
      return generatedTrip;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate trip');
      setGenerating(false);
      return null;
    }
  }, []);

  const generateTrip = useCallback(async (config: TripConfig): Promise<GeneratedTrip | null> => {
    console.log('generateTrip called with config:', config);

    // Check if this is a location-based trip
    if (config.baseLocation) {
      console.log('Using location-based trip generation');
      return generateLocationBasedTrip(config);
    }

    // Regular trip mode requires start location and destinations
    if (!config.startLocation || config.startLocation.coordinates.lat === undefined || config.destinations.length === 0) {
      const errorMsg = 'Please provide a start location and at least one destination';
      console.error('Trip generation validation failed:', errorMsg, { startLocation: config.startLocation, destinations: config.destinations });
      setError(errorMsg);
      return null;
    }

    console.log('Starting regular trip generation');
    setGenerating(true);
    setError(null);

    try {
      // Load all campsites
      const allCampsites = await loadAllCampsites();
      const numDays = config.duration;
      const numDestinations = config.destinations.length;
      const baseCampMode = config.sameCampsite || false;

      // Calculate how many days to spend at each destination
      // Support user-specified days per destination, with remaining days auto-distributed
      const daysPerDestination: number[] = [];
      let specifiedDays = 0;
      let autoDestinations: number[] = []; // indices of destinations without specified days

      // First pass: collect user-specified days and identify auto destinations
      for (let i = 0; i < numDestinations; i++) {
        const dest = config.destinations[i];
        if (dest.daysAtDestination && dest.daysAtDestination > 0) {
          daysPerDestination.push(dest.daysAtDestination);
          specifiedDays += dest.daysAtDestination;
        } else {
          daysPerDestination.push(0); // placeholder for auto
          autoDestinations.push(i);
        }
      }

      // Calculate remaining days for auto-distributed destinations
      const travelDay = config.returnToStart ? 1 : 0;
      const remainingDays = Math.max(0, numDays - specifiedDays - travelDay);

      // Distribute remaining days to auto destinations
      if (autoDestinations.length > 0 && remainingDays > 0) {
        const basePerAuto = Math.floor(remainingDays / autoDestinations.length);
        let extraDays = remainingDays % autoDestinations.length;

        for (const idx of autoDestinations) {
          daysPerDestination[idx] = basePerAuto + (extraDays > 0 ? 1 : 0);
          if (extraDays > 0) extraDays--;
        }
      } else if (autoDestinations.length > 0) {
        // No remaining days, give each auto destination 1 day minimum
        for (const idx of autoDestinations) {
          daysPerDestination[idx] = 1;
        }
      }

      console.log(`[generateTrip] Days per destination: ${daysPerDestination.join(', ')} (specified: ${specifiedDays}, auto: ${autoDestinations.length})`);

      // Pre-compute campsites for each destination
      const lodgingPref = config.lodgingPreference || 'dispersed';
      const destinationCampsites: Map<string, TripStop> = new Map();
      for (const dest of config.destinations) {
        // Try finding campsites, expanding search radius if needed
        let nearbyCamps = await findNearbyCampsites(
          dest.coordinates.lat,
          dest.coordinates.lng,
          allCampsites,
          50,
          lodgingPref
        );

        // If no campsites within 50 miles, try 100 miles for remote destinations
        if (nearbyCamps.length === 0) {
          nearbyCamps = await findNearbyCampsites(
            dest.coordinates.lat,
            dest.coordinates.lng,
            allCampsites,
            100,
            lodgingPref
          );
        }

        if (nearbyCamps.length > 0) {
          const bestCamp = nearbyCamps[0];
          const campDescription = lodgingPref === 'established'
            ? bestCamp.note || 'Established campground'
            : bestCamp.note || 'Dispersed camping';
          destinationCampsites.set(dest.id, {
            id: `camp-base-${dest.id}`,
            name: bestCamp.name,
            type: 'camp',
            coordinates: { lat: bestCamp.lat, lng: bestCamp.lng },
            duration: 'Overnight',
            distance: `${bestCamp.distance.toFixed(1)} mi from ${dest.name}`,
            description: campDescription,
            day: 0,
            note: bestCamp.note,
          });
        }
      }

      // Determine hiking preference
      const hikingPreference = config.hikingPreference || 'daily';

      // Pre-fetch multiple hikes for each destination (for multi-day stays) - skip if no hikes wanted
      const destinationHikes: Map<string, TripStop[]> = new Map();
      if (hikingPreference !== 'none') {
        for (const dest of config.destinations) {
          let hikes = await findNearbyHikes(dest.coordinates.lat, dest.coordinates.lng, 50000);
          // For surprise mode, sort by rating to get best hikes
          if (hikingPreference === 'surprise') {
            hikes = hikes.sort((a, b) => (b.rating || 0) - (a.rating || 0));
          }
          destinationHikes.set(dest.id, hikes);
        }
      }

      // Determine which days to include hikes based on pace preference
      const pacePreference = config.pacePreference || 'moderate';
      let hikingDays: Set<number> = new Set();

      if (hikingPreference !== 'none') {
        // Determine hiking frequency based on pace
        let hikingPercentage: number;
        if (pacePreference === 'packed') {
          hikingPercentage = 1.0; // 100% - hike every day
        } else if (pacePreference === 'moderate') {
          hikingPercentage = 0.6; // 60% of days
        } else {
          hikingPercentage = 0.3; // 30% of days (relaxed)
        }

        const numHikingDays = Math.max(1, Math.round(numDays * hikingPercentage));

        if (hikingPercentage >= 1.0) {
          // Hike every day
          for (let d = 1; d <= numDays; d++) hikingDays.add(d);
        } else {
          // Spread hikes evenly across the trip
          const interval = numDays / numHikingDays;
          for (let i = 0; i < numHikingDays; i++) {
            const dayNum = Math.min(numDays, Math.round(1 + i * interval));
            hikingDays.add(dayNum);
          }
        }
        console.log(`[generateTrip] Pace: ${pacePreference}, hiking ${numHikingDays}/${numDays} days`);
      }

      // Generate days
      const days: TripDay[] = [];
      let totalDistanceMiles = 0;
      let totalDrivingMinutes = 0;
      let dayNumber = 1;
      let usedHikeIds = new Set<string>();

      // Process each destination
      for (let destIdx = 0; destIdx < numDestinations; destIdx++) {
        const dest = config.destinations[destIdx];
        const daysAtDest = daysPerDestination[destIdx];
        const prevPoint = destIdx === 0 ? config.startLocation : config.destinations[destIdx - 1];
        const campsite = destinationCampsites.get(dest.id);
        const availableHikes = destinationHikes.get(dest.id) || [];

        for (let dayAtDest = 0; dayAtDest < daysAtDest; dayAtDest++) {
          const dayStops: TripStop[] = [];
          let dayDistanceMiles = 0;
          let dayDrivingMinutes = 0;
          const isArrivalDay = dayAtDest === 0;
          const isLastDayAtDest = dayAtDest === daysAtDest - 1;

          // On arrival day, add travel from previous point
          if (isArrivalDay) {
            const legDistance = getDistanceMiles(
              prevPoint.coordinates.lat,
              prevPoint.coordinates.lng,
              dest.coordinates.lat,
              dest.coordinates.lng
            );
            const legDrivingMinutes = (legDistance / 45) * 60;
            dayDistanceMiles += legDistance;
            dayDrivingMinutes += legDrivingMinutes;

            // Add destination as a viewpoint stop
            const destinationStop: TripStop = {
              id: `dest-${dayNumber}`,
              name: dest.name,
              type: 'viewpoint',
              coordinates: dest.coordinates,
              duration: daysAtDest > 1 ? `Exploring (Day 1 of ${daysAtDest})` : '1-2h explore',
              distance: `${legDistance.toFixed(0)} mi from ${prevPoint.name}`,
              description: dest.address,
              day: dayNumber,
              placeId: dest.placeId,
            };
            dayStops.push(destinationStop);
          } else {
            // Extra day at destination - add an "explore" stop
            const exploreStop: TripStop = {
              id: `explore-${dayNumber}`,
              name: `Explore ${dest.name}`,
              type: 'viewpoint',
              coordinates: dest.coordinates,
              duration: `Day ${dayAtDest + 1} of ${daysAtDest} at ${dest.name}`,
              distance: 'Staying in area',
              description: `Recommended extra day to explore the ${dest.name} area`,
              day: dayNumber,
              placeId: dest.placeId,
            };
            dayStops.push(exploreStop);
          }

          // Find a unique hike for this day (based on pace preference)
          let hike: TripStop | undefined;
          const shouldHikeToday = hikingDays.has(dayNumber);

          if (shouldHikeToday && availableHikes.length > 0) {
            for (const h of availableHikes) {
              const hikeKey = h.placeId || h.id;
              if (!usedHikeIds.has(hikeKey)) {
                usedHikeIds.add(hikeKey);
                // Use the driving info already calculated in findNearbyHikes
                // The hike object already has accurate distance and drivingTime from Google Directions API
                console.log(`[generateTrip] Assigning hike "${h.name}" with distance: ${h.distance}, drivingTime: ${h.drivingTime}`);
                hike = {
                  ...h,
                  day: dayNumber,
                  id: `hike-${dayNumber}`,
                };
                break;
              }
            }

            if (hike) {
              console.log(`[generateTrip] Added hike to day ${dayNumber}: ${hike.name}, distance: ${hike.distance}`);
              dayStops.push(hike);
              // Extract miles from distance string for totals (e.g., "45 mi drive" -> 45)
              const distanceMatch = hike.distance?.match(/(\d+)/);
              const hikeMiles = distanceMatch ? parseInt(distanceMatch[1], 10) : 0;
              dayDistanceMiles += hikeMiles * 2; // Round trip
              // Extract driving time from drivingTime string for totals
              const timeMatch = hike.drivingTime?.match(/(\d+)\s*min|(\d+)h\s*(\d+)?m?/);
              let hikeMinutes = 0;
              if (timeMatch) {
                if (timeMatch[1]) {
                  hikeMinutes = parseInt(timeMatch[1], 10);
                } else if (timeMatch[2]) {
                  hikeMinutes = parseInt(timeMatch[2], 10) * 60 + (parseInt(timeMatch[3] || '0', 10));
                }
              }
              dayDrivingMinutes += hikeMinutes * 2; // Round trip
            }
          }

          // Add campsite for every night spent at a destination
          // (The return day is handled separately and doesn't need a campsite)
          if (campsite) {
            const campsiteForDay: TripStop = {
              ...campsite,
              id: `camp-${dayNumber}`,
              day: dayNumber,
              description: daysAtDest > 1
                ? `${campsite.note || 'Dispersed camping'} (same camp for ${daysAtDest} nights)`
                : campsite.note || 'Dispersed camping',
            };
            dayStops.push(campsiteForDay);
          }

          totalDistanceMiles += dayDistanceMiles;
          totalDrivingMinutes += dayDrivingMinutes;

          days.push({
            day: dayNumber,
            stops: dayStops,
            campsite: dayStops.find(s => s.type === 'camp'),
            hike,
            drivingDistance: `${Math.round(dayDistanceMiles)} mi`,
            drivingTime: dayDistanceMiles > 0
              ? `${Math.round(dayDrivingMinutes / 60)}h ${Math.round(dayDrivingMinutes % 60)}m`
              : 'No driving',
          });

          dayNumber++;
        }
      }

      // Add return day if needed
      if (config.returnToStart && dayNumber <= numDays) {
        const lastDest = config.destinations[numDestinations - 1];
        const returnDistance = getDistanceMiles(
          lastDest.coordinates.lat,
          lastDest.coordinates.lng,
          config.startLocation.coordinates.lat,
          config.startLocation.coordinates.lng
        );
        const returnDrivingMinutes = (returnDistance / 45) * 60;

        const returnStop: TripStop = {
          id: `return-${dayNumber}`,
          name: `Return to ${config.startLocation.name}`,
          type: 'viewpoint',
          coordinates: config.startLocation.coordinates,
          duration: 'Trip complete',
          distance: `${returnDistance.toFixed(0)} mi`,
          description: `Return drive from ${lastDest.name}`,
          day: dayNumber,
          placeId: config.startLocation.placeId,
        };

        totalDistanceMiles += returnDistance;
        totalDrivingMinutes += returnDrivingMinutes;

        days.push({
          day: dayNumber,
          stops: [returnStop],
          drivingDistance: `${Math.round(returnDistance)} mi`,
          drivingTime: `${Math.round(returnDrivingMinutes / 60)}h ${Math.round(returnDrivingMinutes % 60)}m`,
        });
      }

      const generatedTrip: GeneratedTrip = {
        id: `trip-${Date.now()}`,
        config,
        days,
        totalDistance: `${Math.round(totalDistanceMiles)} mi`,
        totalDrivingTime: `${Math.round(totalDrivingMinutes / 60)}h ${Math.round(totalDrivingMinutes % 60)}m`,
        createdAt: new Date().toISOString(),
      };

      console.log('Trip generation successful:', generatedTrip);
      setGenerating(false);
      return generatedTrip;
    } catch (err) {
      console.error('Trip generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate trip');
      setGenerating(false);
      return null;
    }
  }, [generateLocationBasedTrip]);

  return { generateTrip, generating, error };
}
