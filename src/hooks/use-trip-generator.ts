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

// Find campsites near a point (from saved places, with RIDB fallback)
async function findNearbyCampsites(
  lat: number,
  lng: number,
  allCampsites: GoogleSavedPlace[],
  radiusMiles: number = 50
): Promise<(GoogleSavedPlace & { distance: number })[]> {
  // First try saved campsites
  const savedCampsites = allCampsites
    .map((site) => ({
      ...site,
      distance: getDistanceMiles(lat, lng, site.lat, site.lng),
    }))
    .filter((site) => site.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);

  // If we have saved campsites, use them
  if (savedCampsites.length > 0) {
    return savedCampsites;
  }

  // Fallback to RIDB API
  console.log('No saved campsites found, searching RIDB...');
  const ridbCampsites = await searchRIDBCampsites(lat, lng, radiusMiles);

  if (ridbCampsites.length > 0) {
    console.log(`Found ${ridbCampsites.length} campsites from RIDB`);
  }

  return ridbCampsites;
}

// Find hikes near a point using Google Places
async function findNearbyHikes(
  lat: number,
  lng: number,
  radiusMeters: number = 48280
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

    service.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const hikes: TripStop[] = results
          .filter((place) => place.geometry?.location)
          .slice(0, 5)
          .map((place, index) => ({
            id: `hike-${place.place_id}-${index}`,
            name: place.name || 'Unknown Trail',
            type: 'hike' as const,
            coordinates: {
              lat: place.geometry!.location!.lat(),
              lng: place.geometry!.location!.lng(),
            },
            duration: '2-4h hike',
            distance: `${getDistanceMiles(lat, lng, place.geometry!.location!.lat(), place.geometry!.location!.lng()).toFixed(1)} mi from camp`,
            description: place.vicinity || '',
            day: 0,
            placeId: place.place_id,
            rating: place.rating,
            reviewCount: place.user_ratings_total,
          }));
        resolve(hikes);
      } else {
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
      console.log('Searching for campsites within 50 miles of:', baseLocation.name, baseLocation.coordinates);
      const nearbyCamps = await findNearbyCampsites(
        baseLocation.coordinates.lat,
        baseLocation.coordinates.lng,
        allCampsites,
        50
      );
      console.log('Found nearby camps:', nearbyCamps.length, nearbyCamps.slice(0, 3).map(c => c.name));

      // If same campsite option, pick the best one upfront
      let fixedCampsite: TripStop | undefined;
      if (sameCampsite && nearbyCamps.length > 0) {
        const bestCamp = nearbyCamps[0];
        fixedCampsite = {
          id: `camp-base`,
          name: bestCamp.name,
          type: 'camp',
          coordinates: { lat: bestCamp.lat, lng: bestCamp.lng },
          duration: 'Overnight',
          distance: `${bestCamp.distance.toFixed(1)} mi from ${baseLocation.name}`,
          description: bestCamp.note || 'Dispersed camping (base camp)',
          day: 1,
          note: bestCamp.note,
        };
      }

      for (let day = 1; day <= numDays; day++) {
        const dayStops: TripStop[] = [];
        let dayDistanceMiles = 0;

        // Find hikes for this day
        const dayHikes: TripStop[] = [];
        const nearbyHikes = await findNearbyHikes(
          baseLocation.coordinates.lat,
          baseLocation.coordinates.lng,
          50000 // 50km radius
        );

        // Get unique hikes for this day
        const availableHikes = nearbyHikes.filter(h => !usedHikeIds.has(h.placeId || h.id));
        for (let i = 0; i < activitiesPerDay && i < availableHikes.length; i++) {
          // Calculate distance and driving time from base/camp to trailhead
          const hikeDist = getDistanceMiles(
            baseLocation.coordinates.lat,
            baseLocation.coordinates.lng,
            availableHikes[i].coordinates.lat,
            availableHikes[i].coordinates.lng
          );
          // Estimate driving time at 25 mph on back roads
          const hikeDrivingMinutes = Math.round((hikeDist / 25) * 60);
          const drivingTimeStr = hikeDrivingMinutes < 60
            ? `${hikeDrivingMinutes} min each way`
            : `${Math.floor(hikeDrivingMinutes / 60)}h ${hikeDrivingMinutes % 60}m each way`;

          const hike = {
            ...availableHikes[i],
            day,
            id: `hike-${day}-${i}`,
            distance: `${hikeDist.toFixed(1)} mi from camp`,
            drivingTime: drivingTimeStr,
          };
          usedHikeIds.add(availableHikes[i].placeId || availableHikes[i].id);
          dayHikes.push(hike);
          dayStops.push(hike);

          dayDistanceMiles += hikeDist * 2; // Round trip
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
              campsite = {
                id: `camp-${day}`,
                name: campToUse.name,
                type: 'camp',
                coordinates: { lat: campToUse.lat, lng: campToUse.lng },
                duration: 'Overnight',
                distance: `${campToUse.distance.toFixed(1)} mi from ${baseLocation.name}`,
                description: campToUse.note || 'Dispersed camping',
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
      // If trip is longer than destinations, distribute extra days
      const daysPerDestination: number[] = new Array(numDestinations).fill(1);
      let extraDays = numDays - numDestinations - 1; // -1 for travel day back if returning

      if (!config.returnToStart) {
        extraDays = numDays - numDestinations;
      }

      // Distribute extra days among destinations (round-robin, prioritizing first destinations)
      let destIndex = 0;
      while (extraDays > 0) {
        daysPerDestination[destIndex % numDestinations]++;
        destIndex++;
        extraDays--;
      }

      console.log('Days per destination:', daysPerDestination);

      // Pre-compute campsites for each destination
      const destinationCampsites: Map<string, TripStop> = new Map();
      for (const dest of config.destinations) {
        const nearbyCamps = await findNearbyCampsites(
          dest.coordinates.lat,
          dest.coordinates.lng,
          allCampsites,
          50
        );
        if (nearbyCamps.length > 0) {
          const bestCamp = nearbyCamps[0];
          destinationCampsites.set(dest.id, {
            id: `camp-base-${dest.id}`,
            name: bestCamp.name,
            type: 'camp',
            coordinates: { lat: bestCamp.lat, lng: bestCamp.lng },
            duration: 'Overnight',
            distance: `${bestCamp.distance.toFixed(1)} mi from ${dest.name}`,
            description: bestCamp.note || 'Dispersed camping',
            day: 0,
            note: bestCamp.note,
          });
        }
      }

      // Pre-fetch multiple hikes for each destination (for multi-day stays)
      const destinationHikes: Map<string, TripStop[]> = new Map();
      for (const dest of config.destinations) {
        const hikes = await findNearbyHikes(dest.coordinates.lat, dest.coordinates.lng, 50000);
        destinationHikes.set(dest.id, hikes);
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

          // Find a unique hike for this day
          let hike: TripStop | undefined;
          for (const h of availableHikes) {
            const hikeKey = h.placeId || h.id;
            if (!usedHikeIds.has(hikeKey)) {
              usedHikeIds.add(hikeKey);
              // Calculate driving time from destination to trailhead
              const hikeDist = getDistanceMiles(
                dest.coordinates.lat,
                dest.coordinates.lng,
                h.coordinates.lat,
                h.coordinates.lng
              );
              const hikeDrivingMinutes = Math.round((hikeDist / 25) * 60);
              const drivingTimeStr = hikeDrivingMinutes < 60
                ? `${hikeDrivingMinutes} min each way`
                : `${Math.floor(hikeDrivingMinutes / 60)}h ${hikeDrivingMinutes % 60}m each way`;

              hike = {
                ...h,
                day: dayNumber,
                id: `hike-${dayNumber}`,
                distance: `${hikeDist.toFixed(1)} mi from ${dest.name}`,
                drivingTime: drivingTimeStr,
              };
              break;
            }
          }

          if (hike) {
            dayStops.push(hike);
            // Add hike round-trip driving to day totals
            const hikeDist = getDistanceMiles(
              dest.coordinates.lat,
              dest.coordinates.lng,
              hike.coordinates.lat,
              hike.coordinates.lng
            );
            dayDistanceMiles += hikeDist * 2;
            dayDrivingMinutes += (hikeDist * 2 / 25) * 60;
          }

          // Add campsite (except on last day of trip if returning home)
          const isLastDayOfTrip = destIdx === numDestinations - 1 && isLastDayAtDest;
          if (!isLastDayOfTrip || !config.returnToStart) {
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
