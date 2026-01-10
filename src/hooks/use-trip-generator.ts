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

// Find campsites near a point
async function findNearbyCampsites(
  lat: number,
  lng: number,
  allCampsites: GoogleSavedPlace[],
  radiusMiles: number = 50
): Promise<(GoogleSavedPlace & { distance: number })[]> {
  return allCampsites
    .map((site) => ({
      ...site,
      distance: getDistanceMiles(lat, lng, site.lat, site.lng),
    }))
    .filter((site) => site.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);
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
      const nearbyCamps = await findNearbyCampsites(
        baseLocation.coordinates.lat,
        baseLocation.coordinates.lng,
        allCampsites,
        60
      );

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
          const hike = {
            ...availableHikes[i],
            day,
            id: `hike-${day}-${i}`,
          };
          usedHikeIds.add(availableHikes[i].placeId || availableHikes[i].id);
          dayHikes.push(hike);
          dayStops.push(hike);

          // Calculate distance from base
          const hikeDist = getDistanceMiles(
            baseLocation.coordinates.lat,
            baseLocation.coordinates.lng,
            hike.coordinates.lat,
            hike.coordinates.lng
          );
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
    // Check if this is a location-based trip
    if (config.baseLocation) {
      return generateLocationBasedTrip(config);
    }

    // Regular trip mode requires start location and destinations
    if (!config.startLocation?.coordinates.lat || config.destinations.length === 0) {
      setError('Please provide a start location and at least one destination');
      return null;
    }

    setGenerating(true);
    setError(null);

    try {
      // Load all campsites
      const allCampsites = await loadAllCampsites();

      // Build the route points (start -> destinations -> optionally back to start)
      const routePoints: TripDestination[] = [
        config.startLocation,
        ...config.destinations,
      ];

      if (config.returnToStart) {
        routePoints.push(config.startLocation);
      }

      // Calculate how to distribute destinations across days
      const numDays = config.duration;
      const numLegs = routePoints.length - 1;
      const stopsPerDay = Math.max(1, Math.ceil(numLegs / numDays));
      const baseCampMode = config.sameCampsite || false;

      // Pre-compute base campsites for each destination if baseCampMode is enabled
      const destinationCampsites: Map<string, TripStop> = new Map();
      if (baseCampMode) {
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
              description: bestCamp.note || 'Dispersed camping (base camp)',
              day: 0,
              note: bestCamp.note,
            });
          }
        }
      }

      // Generate days
      const days: TripDay[] = [];
      let currentPointIndex = 0;
      let totalDistanceMiles = 0;
      let totalDrivingMinutes = 0;
      let lastDestinationId: string | null = null;

      for (let day = 1; day <= numDays; day++) {
        const dayStops: TripStop[] = [];
        let dayDistanceMiles = 0;
        let dayDrivingMinutes = 0;

        // Start point for the day
        const startPoint = routePoints[currentPointIndex];

        // Calculate how many legs to cover today
        const legsToday = day === numDays
          ? numLegs - currentPointIndex
          : Math.min(stopsPerDay, numLegs - currentPointIndex);

        // Track current destination for base camp
        let currentDestinationId: string | null = null;

        // Add destinations for this day
        for (let leg = 0; leg < legsToday && currentPointIndex < routePoints.length - 1; leg++) {
          const from = routePoints[currentPointIndex];
          const to = routePoints[currentPointIndex + 1];

          const legDistance = getDistanceMiles(
            from.coordinates.lat,
            from.coordinates.lng,
            to.coordinates.lat,
            to.coordinates.lng
          );

          // Estimate driving time (assume average 45 mph with stops)
          const legDrivingMinutes = (legDistance / 45) * 60;

          dayDistanceMiles += legDistance;
          dayDrivingMinutes += legDrivingMinutes;

          // Add destination stop
          const destinationStop: TripStop = {
            id: `dest-${day}-${leg}`,
            name: to.name,
            type: 'viewpoint',
            coordinates: to.coordinates,
            duration: '1-2h explore',
            distance: `${legDistance.toFixed(0)} mi`,
            description: to.address,
            day,
            placeId: to.placeId,
          };

          dayStops.push(destinationStop);
          currentPointIndex++;

          // Track the destination we're at
          const matchingDest = config.destinations.find(d => d.placeId === to.placeId);
          if (matchingDest) {
            currentDestinationId = matchingDest.id;
          }
        }

        // Find the endpoint for today (where we'll camp)
        const endPoint = routePoints[Math.min(currentPointIndex, routePoints.length - 1)];

        // Find nearby campsite for this night (except last day if returning home)
        let campsite: TripStop | undefined;
        if (day < numDays || !config.returnToStart) {
          if (baseCampMode && currentDestinationId && destinationCampsites.has(currentDestinationId)) {
            // Use the base camp for this destination
            const baseCamp = destinationCampsites.get(currentDestinationId)!;
            campsite = {
              ...baseCamp,
              id: `camp-${day}`,
              day,
            };
          } else {
            // Find new campsite
            const nearbyCamps = await findNearbyCampsites(
              endPoint.coordinates.lat,
              endPoint.coordinates.lng,
              allCampsites,
              50
            );

            if (nearbyCamps.length > 0) {
              const bestCamp = nearbyCamps[0];
              campsite = {
                id: `camp-${day}`,
                name: bestCamp.name,
                type: 'camp',
                coordinates: { lat: bestCamp.lat, lng: bestCamp.lng },
                duration: 'Overnight',
                distance: `${bestCamp.distance.toFixed(1)} mi from ${endPoint.name}`,
                description: bestCamp.note || 'Dispersed camping',
                day,
                note: bestCamp.note,
              };
            }
          }

          if (campsite) {
            dayStops.push(campsite);
          }
        }

        lastDestinationId = currentDestinationId;

        // Find nearby hike for this day
        let hike: TripStop | undefined;
        const hikeSearchPoint = campsite?.coordinates || endPoint.coordinates;
        const nearbyHikes = await findNearbyHikes(
          hikeSearchPoint.lat,
          hikeSearchPoint.lng,
          30000 // 30km radius
        );

        if (nearbyHikes.length > 0) {
          hike = {
            ...nearbyHikes[0],
            day,
            id: `hike-${day}`,
          };
          // Insert hike before campsite
          const campsiteIndex = dayStops.findIndex(s => s.type === 'camp');
          if (campsiteIndex >= 0) {
            dayStops.splice(campsiteIndex, 0, hike);
          } else {
            dayStops.push(hike);
          }
        }

        totalDistanceMiles += dayDistanceMiles;
        totalDrivingMinutes += dayDrivingMinutes;

        days.push({
          day,
          stops: dayStops,
          campsite,
          hike,
          drivingDistance: `${Math.round(dayDistanceMiles)} mi`,
          drivingTime: `${Math.round(dayDrivingMinutes / 60)}h ${Math.round(dayDrivingMinutes % 60)}m`,
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

      setGenerating(false);
      return generatedTrip;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate trip');
      setGenerating(false);
      return null;
    }
  }, [generateLocationBasedTrip]);

  return { generateTrip, generating, error };
}
