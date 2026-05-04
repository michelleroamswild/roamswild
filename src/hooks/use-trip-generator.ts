import { useState, useCallback } from 'react';
import { TripConfig, GeneratedTrip, TripDay, TripStop, TripDestination } from '@/types/trip';
import { GoogleSavedPlace } from './use-nearby-places';
import { supabase } from '@/integrations/supabase/client';

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

interface RIDBFacility {
  FacilityID: string;
  FacilityName: string;
  FacilityDescription: string;
  FacilityLatitude: number;
  FacilityLongitude: number;
  FacilityTypeDescription: string;
  Reservable?: boolean;
  FacilityReservationURL?: string;
  // Parent recreation area info (for identifying national parks)
  ParentRecAreaID?: string;
  OrgRecAreaID?: string;
  ParentOrgID?: string;
}

// Per-night availability info
interface NightAvailability {
  date: string; // YYYY-MM-DD
  availableSites: number;
}

// Extended campsite info with booking details
interface CampsiteWithBooking extends GoogleSavedPlace {
  distance: number;
  bookingUrl?: string;
  isReservable?: boolean;
  facilityId?: string; // RIDB facility ID for availability checking
  perNightAvailability?: NightAvailability[]; // Per-night availability for RIDB sites
  isNationalPark?: boolean; // True if campground is in a national park/monument
}

// USFS Recreation Opportunities API - has campgrounds not in RIDB
const USFS_RECREATION_API = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01/MapServer/0/query';

// Overpass API endpoints for OSM data
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Search RIDB for campsites near a location via Supabase Edge Function
async function searchRIDBCampsites(
  lat: number,
  lng: number,
  radiusMiles: number = 50
): Promise<CampsiteWithBooking[]> {
  try {
    // Use local Vite proxy for RIDB API (proxies to ridb.recreation.gov with API key)
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      radius: radiusMiles.toString(),
      limit: '200',
    });

    const response = await fetch(`/api/ridb/facilities?${params}`);

    if (!response.ok) {
      console.error('[searchRIDBCampsites] RIDB API error:', response.status, await response.text());
      return [];
    }

    const data = await response.json();
    let allFacilities: RIDBFacility[] = data.RECDATA || [];

    // Filter for campgrounds by type or name
    const campgroundKeywords = ['campground', 'camping', 'camp'];
    let facilities = allFacilities.filter(f => {
      const typeDesc = (f.FacilityTypeDescription || '').toLowerCase();
      const name = (f.FacilityName || '').toLowerCase();
      return campgroundKeywords.some(kw => typeDesc.includes(kw) || name.includes(kw));
    });

    // Also search for recreation areas (national parks, etc.) and get their facilities
    const recAreaParams = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      radius: radiusMiles.toString(),
      limit: '20',
    });

    const recAreaResponse = await fetch(`/api/ridb/recareas?${recAreaParams}`);

    if (recAreaResponse.ok) {
      const recAreaData = await recAreaResponse.json();
      const recAreas = recAreaData.RECDATA || [];

      // Get facilities from each recreation area (up to 5 areas to avoid too many requests)
      for (const recArea of recAreas.slice(0, 5)) {
        try {
          // Note: /recareas/{id}/facilities doesn't support activity filter, so fetch all and filter
          const areaResponse = await fetch(`/api/ridb/recareas/${recArea.RecAreaID}/facilities?limit=100`);

          if (areaResponse.ok) {
            const areaData = await areaResponse.json();
            const allAreaFacilities: RIDBFacility[] = areaData.RECDATA || [];

            // Filter for campgrounds
            const campgroundKeywords = ['campground', 'camping', 'camp'];
            const areaFacilities = allAreaFacilities.filter(f => {
              const typeDesc = (f.FacilityTypeDescription || '').toLowerCase();
              const name = (f.FacilityName || '').toLowerCase();
              return campgroundKeywords.some(kw => typeDesc.includes(kw) || name.includes(kw));
            });

            // Add facilities that aren't already in our list
            const existingIds = new Set(facilities.map(f => f.FacilityID));
            for (const facility of areaFacilities) {
              if (!existingIds.has(facility.FacilityID)) {
                facilities.push(facility);
                existingIds.add(facility.FacilityID);
              }
            }
          } else {
            console.warn(`[searchRIDBCampsites] Failed to fetch facilities for ${recArea.RecAreaName}: ${areaResponse.status}`);
          }
        } catch (err) {
          console.warn(`[searchRIDBCampsites] Failed to get facilities for ${recArea.RecAreaName}:`, err);
        }
      }
    }

    // Filter to only include valid facilities with coordinates
    const campgrounds = facilities.filter(f => f.FacilityLatitude && f.FacilityLongitude);

    // Keywords that indicate national park/monument campgrounds
    const npKeywords = ['national park', 'national monument', 'national recreation area', 'national seashore', 'national lakeshore'];

    return campgrounds
      .map((facility) => {
        const distance = getDistanceMiles(lat, lng, facility.FacilityLatitude, facility.FacilityLongitude);
        // Clean up the description - remove HTML tags
        const cleanDescription = facility.FacilityDescription
          ?.replace(/<[^>]*>/g, '')
          ?.slice(0, 200) || facility.FacilityTypeDescription;

        // Build booking URL for Recreation.gov
        const bookingUrl = `https://www.recreation.gov/camping/campgrounds/${facility.FacilityID}`;

        // Check if this is a national park campground
        const nameLower = facility.FacilityName.toLowerCase();
        const descLower = (facility.FacilityDescription || '').toLowerCase();
        const isNationalPark = npKeywords.some(kw => nameLower.includes(kw) || descLower.includes(kw));

        return {
          id: `ridb-${facility.FacilityID}`,
          name: facility.FacilityName,
          lat: facility.FacilityLatitude,
          lng: facility.FacilityLongitude,
          note: cleanDescription,
          distance,
          bookingUrl,
          isReservable: facility.Reservable ?? true, // Assume reservable if not specified
          facilityId: facility.FacilityID,
          isNationalPark,
        };
      })
      .sort((a, b) => a.distance - b.distance);
  } catch (error) {
    console.error('RIDB search error:', error);
    return [];
  }
}

// Search USFS Recreation Opportunities API for campgrounds
async function searchUSFSCampgrounds(
  lat: number,
  lng: number,
  radiusMiles: number = 50
): Promise<(GoogleSavedPlace & { distance: number })[]> {
  try {
    // Calculate bounding box
    const latDelta = radiusMiles / 69;
    const lngDelta = radiusMiles / (69 * Math.cos(lat * (Math.PI / 180)));
    const minLat = lat - latDelta;
    const maxLat = lat + latDelta;
    const minLng = lng - lngDelta;
    const maxLng = lng + lngDelta;

    const params = new URLSearchParams({
      where: "MARKERACTIVITY LIKE '%Campground%' OR MARKERACTIVITY LIKE '%Camping%' OR MARKERACTIVITYGROUP LIKE '%Camping%'",
      geometry: JSON.stringify({
        xmin: minLng,
        ymin: minLat,
        xmax: maxLng,
        ymax: maxLat,
        spatialReference: { wkid: 4326 },
      }),
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'RECAREAID,RECAREANAME,RECAREADESCRIPTION,FORESTNAME,MARKERACTIVITY',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'json',
    });

    console.log('[searchUSFSCampgrounds] Fetching USFS campgrounds');
    const response = await fetch(`${USFS_RECREATION_API}?${params}`);

    if (!response.ok) {
      console.warn('[searchUSFSCampgrounds] USFS API error:', response.status);
      return [];
    }

    const data = await response.json();
    if (!data.features) {
      return [];
    }

    console.log(`[searchUSFSCampgrounds] Found ${data.features.length} USFS campgrounds`);

    return data.features
      .filter((f: any) => f.geometry?.x && f.geometry?.y)
      .map((f: any) => {
        const campLat = f.geometry.y;
        const campLng = f.geometry.x;
        const distance = getDistanceMiles(lat, lng, campLat, campLng);
        const cleanDescription = f.attributes.RECAREADESCRIPTION
          ?.replace(/<[^>]*>/g, '')
          ?.slice(0, 200) || '';

        return {
          id: `usfs-${f.attributes.RECAREAID}`,
          name: f.attributes.RECAREANAME || 'USFS Campground',
          lat: campLat,
          lng: campLng,
          note: cleanDescription || `${f.attributes.FORESTNAME || 'USFS'} - ${f.attributes.MARKERACTIVITY || 'Campground'}`,
          distance,
        };
      })
      .filter((c: any) => c.distance <= radiusMiles)
      .sort((a: any, b: any) => a.distance - b.distance);
  } catch (error) {
    console.error('[searchUSFSCampgrounds] Error:', error);
    return [];
  }
}

// Search OSM for established campgrounds via Overpass API
async function searchOSMCampgrounds(
  lat: number,
  lng: number,
  radiusMiles: number = 50
): Promise<(GoogleSavedPlace & { distance: number })[]> {
  try {
    // Calculate bounding box
    const latDelta = radiusMiles / 69;
    const lngDelta = radiusMiles / (69 * Math.cos(lat * (Math.PI / 180)));
    const minLat = lat - latDelta;
    const maxLat = lat + latDelta;
    const minLng = lng - lngDelta;
    const maxLng = lng + lngDelta;

    // Query for established campgrounds (not just any camp_site)
    const query = `
      [out:json][timeout:30];
      (
        node["tourism"="camp_site"](${minLat},${minLng},${maxLat},${maxLng});
        way["tourism"="camp_site"](${minLat},${minLng},${maxLat},${maxLng});
      );
      out center;
    `;

    let response: Response | null = null;
    let lastError: Error | null = null;

    // Try multiple Overpass endpoints
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        if (response.ok) break;

        if (response.status === 429 || response.status === 504) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        lastError = new Error(`Overpass API error: ${response.status}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    if (!response?.ok) {
      console.warn('[searchOSMCampgrounds] All Overpass endpoints failed:', lastError);
      return [];
    }

    const data = await response.json();
    if (!data.elements) {
      return [];
    }

    console.log(`[searchOSMCampgrounds] Found ${data.elements.length} OSM camp sites`);

    // Filter to only established campgrounds (with facilities/fee/capacity indicators)
    const campgrounds = data.elements
      .map((el: any) => {
        const campLat = el.lat || el.center?.lat;
        const campLng = el.lon || el.center?.lon;
        if (!campLat || !campLng) return null;

        const tags = el.tags || {};
        const name = tags.name || '';

        // Check if this is an established campground (not dispersed)
        const isWay = el.type === 'way';
        const hasFee = tags.fee === 'yes';
        const hasAmenities = tags.toilets || tags.drinking_water || tags.shower || tags.power_supply;
        const hasCapacity = tags.capacity && parseInt(tags.capacity) > 5;
        const nameIndicatesCampground = /campground|camp\s|camping|rv\s*park/i.test(name);
        const isBackcountry = tags.backcountry === 'yes' || tags.camp_site === 'basic';

        // Score how likely this is an established campground
        let establishedScore = 0;
        if (isWay) establishedScore += 3;
        if (hasFee) establishedScore += 2;
        if (hasAmenities) establishedScore += 2;
        if (hasCapacity) establishedScore += 1;
        if (nameIndicatesCampground) establishedScore += 2;
        if (isBackcountry) establishedScore -= 5;

        // Only include if it looks like an established campground
        if (establishedScore < 3) return null;

        const distance = getDistanceMiles(lat, lng, campLat, campLng);

        return {
          id: `osm-${el.id}`,
          name: name || 'OSM Campground',
          lat: campLat,
          lng: campLng,
          note: tags.description || (tags.operator ? `Operated by ${tags.operator}` : 'Campground'),
          distance,
        };
      })
      .filter((c: any) => c !== null && c.distance <= radiusMiles)
      .sort((a: any, b: any) => a.distance - b.distance);

    console.log(`[searchOSMCampgrounds] Filtered to ${campgrounds.length} established campgrounds`);
    return campgrounds;
  } catch (error) {
    console.error('[searchOSMCampgrounds] Error:', error);
    return [];
  }
}

// Helper to check if a point is within a polygon (ray casting algorithm)
function isPointInPolygon(lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;

    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Search OSM for dispersed/primitive camp sites (NOT established campgrounds)
// Filters out sites within national parks where dispersed camping is not allowed
async function searchOSMDispersedSites(
  lat: number,
  lng: number,
  radiusMiles: number = 50
): Promise<(GoogleSavedPlace & { distance: number })[]> {
  try {
    // Calculate bounding box
    const latDelta = radiusMiles / 69;
    const lngDelta = radiusMiles / (69 * Math.cos(lat * (Math.PI / 180)));
    const minLat = lat - latDelta;
    const maxLat = lat + latDelta;
    const minLng = lng - lngDelta;
    const maxLng = lng + lngDelta;

    // Query for camp sites AND national park/protected area boundaries
    const query = `
      [out:json][timeout:45];
      (
        // Camp sites
        node["tourism"="camp_site"](${minLat},${minLng},${maxLat},${maxLng});
        node["camp_site"](${minLat},${minLng},${maxLat},${maxLng});
        node["camp_type"](${minLat},${minLng},${maxLat},${maxLng});
        node["leisure"="firepit"](${minLat},${minLng},${maxLat},${maxLng});
        // National parks and protected areas (no dispersed camping allowed)
        relation["boundary"="national_park"](${minLat},${minLng},${maxLat},${maxLng});
        relation["boundary"="protected_area"]["protect_class"~"^[12]$"](${minLat},${minLng},${maxLat},${maxLng});
        relation["leisure"="nature_reserve"](${minLat},${minLng},${maxLat},${maxLng});
        // Private land areas
        way["access"="private"]["landuse"](${minLat},${minLng},${maxLat},${maxLng});
        relation["access"="private"]["landuse"](${minLat},${minLng},${maxLat},${maxLng});
      );
      out body geom;
    `;

    let response: Response | null = null;
    let lastError: Error | null = null;

    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        if (response.ok) break;

        if (response.status === 429 || response.status === 504) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        lastError = new Error(`Overpass API error: ${response.status}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    if (!response?.ok) {
      console.warn('[searchOSMDispersedSites] All Overpass endpoints failed:', lastError);
      return [];
    }

    const data = await response.json();
    if (!data.elements) {
      return [];
    }

    // Separate camp site nodes from protected area boundaries
    const campNodes: any[] = [];
    const protectedAreas: { name: string; polygon: { lat: number; lng: number }[] }[] = [];

    for (const el of data.elements) {
      if (el.type === 'node') {
        // This is a camp site node
        campNodes.push(el);
      } else if ((el.type === 'relation' || el.type === 'way') && el.members) {
        // This is a protected area boundary - extract polygon from members
        const tags = el.tags || {};
        const name = tags.name || 'Protected Area';

        // Build polygon from outer way members
        const polygon: { lat: number; lng: number }[] = [];
        for (const member of el.members) {
          if (member.role === 'outer' && member.geometry) {
            for (const point of member.geometry) {
              polygon.push({ lat: point.lat, lng: point.lon });
            }
          }
        }

        if (polygon.length > 0) {
          protectedAreas.push({ name, polygon });
        }
      } else if (el.type === 'way' && el.geometry) {
        // Way with geometry (private land)
        const tags = el.tags || {};
        const name = tags.name || 'Private Area';

        const polygon = el.geometry.map((p: any) => ({ lat: p.lat, lng: p.lon }));
        if (polygon.length > 0) {
          protectedAreas.push({ name, polygon });
        }
      }
    }

    console.log(`[searchOSMDispersedSites] Found ${campNodes.length} camp sites, ${protectedAreas.length} protected/private areas`);

    // Helper to check if point is in any protected area
    const isInProtectedArea = (campLat: number, campLng: number): { inProtected: boolean; areaName?: string } => {
      for (const area of protectedAreas) {
        if (isPointInPolygon(campLat, campLng, area.polygon)) {
          return { inProtected: true, areaName: area.name };
        }
      }
      return { inProtected: false };
    };

    // Filter to dispersed/primitive sites (opposite of established filter)
    // Also filter out sites within protected areas
    const dispersedSites = campNodes
      .map((el: any) => {
        const campLat = el.lat;
        const campLng = el.lon;
        if (!campLat || !campLng) return null;

        // Check if in protected area first
        const protectedCheck = isInProtectedArea(campLat, campLng);
        if (protectedCheck.inProtected) {
          console.log(`[searchOSMDispersedSites] Filtering out camp in protected area: ${el.tags?.name || 'unnamed'} (in ${protectedCheck.areaName})`);
          return null;
        }

        const tags = el.tags || {};
        const name = tags.name || '';

        // Indicators of dispersed/primitive camping
        const isBackcountry = tags.backcountry === 'yes';
        const isBasic = tags.camp_site === 'basic';
        const isPrimitive = tags.camp_type === 'primitive' || tags.camp_type === 'wildcamp' || tags.camp_type === 'non_designated';
        const isFirepit = tags.leisure === 'firepit';
        const noFee = tags.fee !== 'yes';
        const noAmenities = !tags.toilets && !tags.drinking_water && !tags.shower && !tags.power_supply;

        // Indicators of established campground (we want to EXCLUDE these)
        const isEstablished = el.type === 'way' ||
          (tags.fee === 'yes') ||
          (tags.capacity && parseInt(tags.capacity) > 10) ||
          /campground|rv\s*park/i.test(name);

        // Score how likely this is a dispersed/primitive site
        let dispersedScore = 0;
        if (isBackcountry) dispersedScore += 3;
        if (isBasic) dispersedScore += 3;
        if (isPrimitive) dispersedScore += 3;
        if (isFirepit) dispersedScore += 2;
        if (noFee && noAmenities) dispersedScore += 1;
        if (isEstablished) dispersedScore -= 5;

        // Only include if it looks like a dispersed site
        if (dispersedScore < 1) return null;

        const distance = getDistanceMiles(lat, lng, campLat, campLng);

        return {
          id: `osm-dispersed-${el.id}`,
          name: name || (isFirepit ? 'Fire Ring' : 'Dispersed Camp Site'),
          lat: campLat,
          lng: campLng,
          note: tags.description || (isBackcountry ? 'Backcountry camping' : 'Dispersed camping spot'),
          distance,
        };
      })
      .filter((c: any) => c !== null && c.distance <= radiusMiles)
      .sort((a: any, b: any) => a.distance - b.distance);

    console.log(`[searchOSMDispersedSites] Filtered to ${dispersedSites.length} valid dispersed sites`);
    return dispersedSites;
  } catch (error) {
    console.error('[searchOSMDispersedSites] Error:', error);
    return [];
  }
}

// Search Supabase for dispersed campsites (user's + public)
async function searchDispersedCampsites(
  lat: number,
  lng: number,
  radiusMiles: number = 50
): Promise<(GoogleSavedPlace & { distance: number })[]> {
  try {
    // Convert miles to approximate degrees (1 degree ≈ 69 miles at equator)
    const radiusDegrees = radiusMiles / 69;

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    // Query Supabase for user's campsites + public dispersed sites
    const { data, error } = await supabase
      .from('campsites')
      .select('*')
      .eq('type', 'dispersed')
      .gte('lat', lat - radiusDegrees)
      .lte('lat', lat + radiusDegrees)
      .gte('lng', lng - radiusDegrees)
      .lte('lng', lng + radiusDegrees)
      .or(`user_id.eq.${user?.id || ''},visibility.eq.public`);

    if (error) {
      console.error('Failed to search dispersed campsites:', error);
      return [];
    }

    if (!data || data.length === 0) {
      console.log('[searchDispersedCampsites] No dispersed campsites found in database');
      return [];
    }

    console.log(`[searchDispersedCampsites] Found ${data.length} dispersed campsites`);

    // Calculate distances and filter by actual radius
    const campsitesWithDistance = data
      .map((site) => ({
        id: site.id,
        name: site.name,
        lat: site.lat,
        lng: site.lng,
        note: site.description || site.notes || 'Dispersed camping',
        distance: getDistanceMiles(lat, lng, site.lat, site.lng),
      }))
      .filter((site) => site.distance <= radiusMiles)
      .sort((a, b) => a.distance - b.distance);

    return campsitesWithDistance;
  } catch (error) {
    console.error('Error searching dispersed campsites:', error);
    return [];
  }
}

// Check availability for RIDB campsites via Recreation.gov API
interface AvailabilityResult {
  facilityId: string;
  available: boolean; // true if ANY night has availability
  availableSites: number; // sites available for ALL nights
  totalSites: number;
  perNight?: NightAvailability[]; // per-night availability
}

async function checkCampgroundAvailability(
  facilityIds: string[],
  startDate: string,
  numNights: number
): Promise<Map<string, AvailabilityResult>> {
  const availabilityMap = new Map<string, AvailabilityResult>();

  if (facilityIds.length === 0 || !startDate) {
    return availabilityMap;
  }

  // Parse the date carefully to avoid timezone issues
  const [year, month, day] = startDate.split('-').map(Number);
  const checkInDate = new Date(year, month - 1, day);
  const checkOutDate = new Date(year, month - 1, day + numNights);

  // Get all months we need to check
  const monthsToCheck = new Set<string>();
  const currentDate = new Date(checkInDate);
  while (currentDate <= checkOutDate) {
    const monthStart = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;
    monthsToCheck.add(monthStart);
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  // Check availability for each facility (limit concurrent requests)
  const checkFacility = async (facilityId: string): Promise<void> => {
    try {
      // Extract numeric ID from "ridb-12345" format
      const numericId = facilityId.replace('ridb-', '');

      let totalSites = 0;
      let sitesWithAllNightsAvailable = 0;
      const perNightCounts = new Map<string, number>();

      // Initialize per-night tracking using local date format to avoid timezone issues
      const nightDate = new Date(checkInDate);
      for (let i = 0; i < numNights; i++) {
        const y = nightDate.getFullYear();
        const m = String(nightDate.getMonth() + 1).padStart(2, '0');
        const d = String(nightDate.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        perNightCounts.set(dateStr, 0);
        nightDate.setDate(nightDate.getDate() + 1);
      }

      // Check each month needed
      for (const monthStart of monthsToCheck) {
        const params = new URLSearchParams({ id: numericId, start_date: `${monthStart}T00:00:00.000Z` });
        const response = await fetch(`/api/recreation-availability?${params}`);

        if (!response.ok) {
          continue;
        }

        const data = await response.json();

        // Recreation.gov returns availability by campsite
        if (data.campsites) {
          const campsites = Object.values(data.campsites) as any[];
          totalSites = Math.max(totalSites, campsites.length);

          // Check each campsite for availability
          for (const site of campsites) {
            if (site.availabilities) {
              let allNightsAvailable = true;
              const availabilityKeys = Object.keys(site.availabilities);

              // Check each night using local date format
              const checkDate = new Date(checkInDate);
              for (let i = 0; i < numNights; i++) {
                const y = checkDate.getFullYear();
                const m = String(checkDate.getMonth() + 1).padStart(2, '0');
                const d = String(checkDate.getDate()).padStart(2, '0');
                const dateStr = `${y}-${m}-${d}`;

                // Try multiple date key formats since Recreation.gov format can vary
                const possibleKeys = [
                  dateStr + 'T00:00:00Z',
                  dateStr + 'T00:00:00.000Z',
                  dateStr,
                ];

                // Find matching key
                let status: string | undefined;
                for (const key of possibleKeys) {
                  if (site.availabilities[key]) {
                    status = site.availabilities[key];
                    break;
                  }
                }

                // Also try finding a key that starts with our date
                if (!status) {
                  const matchingKey = availabilityKeys.find(k => k.startsWith(dateStr));
                  if (matchingKey) {
                    status = site.availabilities[matchingKey];
                  }
                }

                if (status === 'Available') {
                  perNightCounts.set(dateStr, (perNightCounts.get(dateStr) || 0) + 1);
                } else {
                  allNightsAvailable = false;
                }
                checkDate.setDate(checkDate.getDate() + 1);
              }

              if (allNightsAvailable) {
                sitesWithAllNightsAvailable++;
              }
            }
          }
        }
      }

      // Build per-night array
      const perNight: NightAvailability[] = [];
      for (const [date, count] of perNightCounts.entries()) {
        perNight.push({ date, availableSites: count });
      }
      perNight.sort((a, b) => a.date.localeCompare(b.date));

      const hasAnyAvailability = perNight.some(n => n.availableSites > 0);

      availabilityMap.set(facilityId, {
        facilityId,
        available: hasAnyAvailability,
        availableSites: sitesWithAllNightsAvailable,
        totalSites,
        perNight,
      });
    } catch (err) {
      console.error(`[checkCampgroundAvailability] Error for ${facilityId}:`, err);
    }
  };

  // Check facilities in batches of 5 to avoid overwhelming the API
  const batchSize = 5;
  for (let i = 0; i < facilityIds.length; i += batchSize) {
    const batch = facilityIds.slice(i, i + batchSize);
    await Promise.all(batch.map(checkFacility));
  }

  return availabilityMap;
}

// Find campsites near a point
// When lodgingPreference is 'campground', use RIDB + USFS + OSM for official campgrounds
// When lodgingPreference is 'dispersed', use user's + public dispersed sites from database
// If tripStartDate is provided, checks availability for RIDB sites and filters to available ones
async function findNearbyCampsites(
  lat: number,
  lng: number,
  radiusMiles: number = 50,
  lodgingPreference: string = 'dispersed',
  tripStartDate?: string, // ISO date string (YYYY-MM-DD)
  tripDuration: number = 1 // Number of nights
): Promise<CampsiteWithBooking[]> {
  // For established/campground camping, combine RIDB, USFS, and OSM sources
  const useEstablished = lodgingPreference === 'established' || lodgingPreference === 'campground';
  if (useEstablished) {
    // Fetch from all three sources in parallel
    const [ridbCampsites, usfsCampsites, osmCampsites] = await Promise.all([
      searchRIDBCampsites(lat, lng, radiusMiles),
      searchUSFSCampgrounds(lat, lng, radiusMiles),
      searchOSMCampgrounds(lat, lng, radiusMiles),
    ]);

    // Check availability for RIDB campsites if trip date is provided
    let availabilityMap = new Map<string, AvailabilityResult>();
    if (tripStartDate && ridbCampsites.length > 0) {
      const ridbFacilityIds = ridbCampsites
        .filter(c => c.facilityId)
        .map(c => c.id);
      availabilityMap = await checkCampgroundAvailability(ridbFacilityIds, tripStartDate, tripDuration);
    }

    // Filter RIDB campsites to only include those with availability
    // Mark them with availability info for display
    if (availabilityMap.size > 0) {
      // First, mark all campsites with their availability data
      for (const camp of ridbCampsites) {
        const availability = availabilityMap.get(camp.id);
        if (availability) {
          camp.perNightAvailability = availability.perNight;

          if (availability.available) {
            const nightsWithAvailability = availability.perNight?.filter(n => n.availableSites > 0).length || 0;
            const totalNights = availability.perNight?.length || 1;

            if (availability.availableSites > 0) {
              camp.note = `✓ ${availability.availableSites} sites for all nights - ${camp.note || 'Established campground'}`;
            } else {
              camp.note = `✓ Available ${nightsWithAvailability}/${totalNights} nights - ${camp.note || 'Established campground'}`;
            }
            camp.isReservable = true;
          }
        }
      }

      // Filter OUT RIDB campsites that have no availability - only show available ones
      const availableRidbCampsites = ridbCampsites.filter(c => c.note?.startsWith('✓'));

      // Replace ridbCampsites with only available ones
      ridbCampsites.length = 0;
      ridbCampsites.push(...availableRidbCampsites);

      // Sort by distance (all are available now)
      ridbCampsites.sort((a, b) => a.distance - b.distance);
    }

    // Normalize campground name for comparison (handles variations like "Big Pine Flat" vs "Big Pine Flat Family Campground")
    const normalizeName = (name: string): string => {
      return name.toLowerCase()
        .replace(/\b(campground|campsite|camp|family|group|rv park|rv)\b/gi, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
    };

    // Check if two campgrounds are duplicates by proximity OR similar name
    const isDuplicateCampground = (newCamp: CampsiteWithBooking, existing: CampsiteWithBooking): boolean => {
      // Check proximity (within 0.25 miles)
      if (getDistanceMiles(newCamp.lat, newCamp.lng, existing.lat, existing.lng) < 0.25) {
        return true;
      }
      // Check name similarity (normalized names match or one contains the other)
      const newName = normalizeName(newCamp.name);
      const existingName = normalizeName(existing.name);
      if (newName === existingName || newName.includes(existingName) || existingName.includes(newName)) {
        return true;
      }
      return false;
    };

    // Combine and deduplicate (RIDB first as most accurate, then USFS, then OSM)
    const allCampsites: CampsiteWithBooking[] = [...ridbCampsites];

    // Add USFS campgrounds if not already in RIDB
    for (const usfsCamp of usfsCampsites) {
      const isDuplicate = allCampsites.some(existing => isDuplicateCampground(usfsCamp, existing));
      if (!isDuplicate) {
        allCampsites.push(usfsCamp as CampsiteWithBooking);
      }
    }

    // Add OSM campgrounds if not already in combined list
    for (const osmCamp of osmCampsites) {
      const isDuplicate = allCampsites.some(existing => isDuplicateCampground(osmCamp, existing));
      if (!isDuplicate) {
        allCampsites.push(osmCamp as CampsiteWithBooking);
      }
    }

    // Sort by: availability > RIDB source > national park > distance
    allCampsites.sort((a, b) => {
      // 1. Prioritize campsites with confirmed availability (marked with ✓)
      const aAvailable = a.note?.startsWith('✓') ? 1 : 0;
      const bAvailable = b.note?.startsWith('✓') ? 1 : 0;
      if (aAvailable !== bAvailable) return bAvailable - aAvailable;

      // 2. Prioritize RIDB over other sources (USFS, OSM)
      const aIsRidb = a.id.startsWith('ridb-') ? 1 : 0;
      const bIsRidb = b.id.startsWith('ridb-') ? 1 : 0;
      if (aIsRidb !== bIsRidb) return bIsRidb - aIsRidb;

      // 3. Prioritize national park campgrounds
      const aNP = a.isNationalPark ? 1 : 0;
      const bNP = b.isNationalPark ? 1 : 0;
      if (aNP !== bNP) return bNP - aNP;

      // 4. Then by distance
      return a.distance - b.distance;
    });

    if (allCampsites.length > 0) {
      return allCampsites;
    }
  }

  // For dispersed camping, search in this order:
  // 1. User's dispersed database (confirmed spots)
  // 2. OSM dispersed/primitive camp sites
  // 3. Return empty with marker if nothing found (UI will prompt user)

  const dispersedCampsites = await searchDispersedCampsites(lat, lng, radiusMiles);

  if (dispersedCampsites.length > 0) {
    return dispersedCampsites as CampsiteWithBooking[];
  }

  // Fallback: Search OSM for dispersed/primitive camp sites
  const osmDispersedSites = await searchOSMDispersedSites(lat, lng, radiusMiles);

  if (osmDispersedSites.length > 0) {
    return osmDispersedSites as CampsiteWithBooking[];
  }

  // No dispersed sites found - return a special marker so the UI can prompt the user
  const noDispersedMarker: CampsiteWithBooking = {
    id: 'no-dispersed-found',
    name: 'No dispersed campsites found',
    lat: lat,
    lng: lng,
    note: 'NO_DISPERSED_SITES_FOUND',
    distance: 0,
  };
  return [noDispersedMarker];

  // OLD FALLBACK CODE - removed to require user action
  /*
  // Fallback to established campgrounds if no dispersed sites found
  console.log('[findNearbyCampsites] No dispersed sites found, falling back to established campgrounds');
  const [ridbFallback, usfsFallback] = await Promise.all([
    searchRIDBCampsites(lat, lng, radiusMiles),
    searchUSFSCampgrounds(lat, lng, radiusMiles),
  ]);

  // Normalize name for deduplication
  const normalizeFallbackName = (name: string): string => {
    return name.toLowerCase()
      .replace(/\b(campground|campsite|camp|family|group|rv park|rv)\b/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  };

  // Combine RIDB and USFS fallback results (RIDB takes priority)
  const fallbackCampsites: CampsiteWithBooking[] = [...ridbFallback];
  for (const usfsCamp of usfsFallback) {
    const isDuplicate = fallbackCampsites.some(existing => {
      // Check proximity
      if (getDistanceMiles(usfsCamp.lat, usfsCamp.lng, existing.lat, existing.lng) < 0.25) {
        return true;
      }
      // Check name similarity
      const newName = normalizeFallbackName(usfsCamp.name);
      const existingName = normalizeFallbackName(existing.name);
      return newName === existingName || newName.includes(existingName) || existingName.includes(newName);
    });
    if (!isDuplicate) {
      fallbackCampsites.push(usfsCamp as CampsiteWithBooking);
    }
  }
  fallbackCampsites.sort((a, b) => a.distance - b.distance);

  return fallbackCampsites;
  */
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
        50,
        lodgingPref,
        config.startDate, // Pass trip start date for availability checking
        numDays - 1 // Number of nights (days - 1)
      );
      console.log('Found nearby camps:', nearbyCamps.length, nearbyCamps.slice(0, 3).map(c => c.name));

      // If same campsite option, pick the best one upfront
      let fixedCampsite: TripStop | undefined;
      if (sameCampsite && nearbyCamps.length > 0) {
        const bestCamp = nearbyCamps[0];
        const campTypeDesc = (lodgingPref === 'established' || lodgingPref === 'campground') ? 'Established campground (base camp)' : 'Dispersed camping (base camp)';
        fixedCampsite = {
          id: bestCamp.id || `camp-base`,
          name: bestCamp.name,
          type: 'camp',
          coordinates: { lat: bestCamp.lat, lng: bestCamp.lng },
          duration: 'Overnight',
          distance: `${bestCamp.distance.toFixed(1)} mi from ${baseLocation.name}`,
          description: bestCamp.note || campTypeDesc,
          day: 1,
          note: bestCamp.note,
          bookingUrl: bestCamp.bookingUrl,
          isReservable: bestCamp.isReservable,
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

        // Skip activities on final day if travelOnlyFinalDay is enabled
        const isFinalDay = day === numDays;
        const skipActivitiesForTravel = config.travelOnlyFinalDay && isFinalDay;

        // Skip activities on the starting day (day 1) — user is traveling to the base location
        const isStartingDay = day === 1;

        if (shouldHikeToday && !skipActivitiesForTravel && !isStartingDay) {
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
              id: fixedCampsite.id,
              day,
              description: fixedCampsite.note || 'Dispersed camping (base camp)',
            };
          } else {
            // Use different campsites each day - prioritize ones with availability for THIS night
            const availableCamps = nearbyCamps.filter(c => !usedCampIds.has(c.id));

            // Calculate the date for this specific night
            let nightDate: string | undefined;
            if (config.startDate) {
              const startDate = new Date(config.startDate);
              startDate.setDate(startDate.getDate() + day - 1); // day is 1-indexed
              nightDate = startDate.toISOString().split('T')[0];
            }

            // Helper to check if a campsite has availability for this specific night
            const hasAvailabilityForNight = (camp: CampsiteWithBooking): boolean => {
              if (!nightDate || !camp.perNightAvailability) return false;
              const nightAvail = camp.perNightAvailability.find(n => n.date === nightDate);
              return nightAvail ? nightAvail.availableSites > 0 : false;
            };

            // Sort available camps: RIDB with availability for this night first, then others
            const sortedCamps = [...availableCamps].sort((a, b) => {
              const aHasAvail = hasAvailabilityForNight(a);
              const bHasAvail = hasAvailabilityForNight(b);

              // Prioritize camps with availability for this specific night
              if (aHasAvail && !bHasAvail) return -1;
              if (!aHasAvail && bHasAvail) return 1;

              // Then prioritize RIDB over other sources
              const aIsRidb = a.id.startsWith('ridb-') ? 1 : 0;
              const bIsRidb = b.id.startsWith('ridb-') ? 1 : 0;
              if (aIsRidb !== bIsRidb) return bIsRidb - aIsRidb;

              // Then prioritize national park campgrounds
              const aNP = a.isNationalPark ? 1 : 0;
              const bNP = b.isNationalPark ? 1 : 0;
              if (aNP !== bNP) return bNP - aNP;

              // Then by distance
              return a.distance - b.distance;
            });

            const campToUse = sortedCamps.length > 0 ? sortedCamps[0] : nearbyCamps[0];

            if (campToUse) {
              usedCampIds.add(campToUse.id);
              const campTypeDesc = (lodgingPref === 'established' || lodgingPref === 'campground') ? 'Established campground' : 'Dispersed camping';

              // Check if this camp has availability for this night
              const hasAvail = hasAvailabilityForNight(campToUse);
              let description = campToUse.note || campTypeDesc;
              if (hasAvail && nightDate) {
                const nightAvail = campToUse.perNightAvailability?.find(n => n.date === nightDate);
                description = `✓ ${nightAvail?.availableSites} sites available - ${campTypeDesc}`;
              }

              campsite = {
                id: campToUse.id || `camp-${day}`,
                name: campToUse.name,
                type: 'camp',
                coordinates: { lat: campToUse.lat, lng: campToUse.lng },
                duration: 'Overnight',
                distance: `${campToUse.distance.toFixed(1)} mi from ${baseLocation.name}`,
                description,
                day,
                note: campToUse.note,
                bookingUrl: campToUse.bookingUrl,
                isReservable: campToUse.isReservable || hasAvail,
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
      const numDays = config.duration;
      const numDestinations = config.destinations.length;
      const baseCampMode = config.sameCampsite || false;

      // Calculate how many days to spend at each destination
      // ALL days are assigned to destinations - start/end locations are just travel points
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

      // All days go to destinations - travel to/from start is part of first/last day
      const remainingDays = Math.max(0, numDays - specifiedDays);

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

      // Pre-fetch all nearby campsites for each destination (for per-night selection)
      const lodgingPref = config.lodgingPreference || 'dispersed';
      const destinationCampsitesList: Map<string, CampsiteWithBooking[]> = new Map();

      // Calculate cumulative day numbers to determine the correct date for each destination
      let cumulativeDays = 0;
      const destinationStartDays: Map<string, number> = new Map();

      for (let i = 0; i < config.destinations.length; i++) {
        const dest = config.destinations[i];
        destinationStartDays.set(dest.id, cumulativeDays);
        cumulativeDays += daysPerDestination[i] || 1;
      }

      for (const dest of config.destinations) {
        // Calculate nights at this destination for availability checking
        const destIndex = config.destinations.indexOf(dest);
        const nightsAtDest = daysPerDestination[destIndex] || 1;

        // Calculate the start date for this destination's stay
        let destStartDate = config.startDate;
        if (config.startDate) {
          const tripStart = new Date(config.startDate);
          const daysUntilDest = destinationStartDays.get(dest.id) || 0;
          tripStart.setDate(tripStart.getDate() + daysUntilDest);
          destStartDate = tripStart.toISOString().split('T')[0];
        }

        // Try finding campsites, expanding search radius if needed
        let nearbyCamps = await findNearbyCampsites(
          dest.coordinates.lat,
          dest.coordinates.lng,
          50,
          lodgingPref,
          destStartDate, // Pass destination start date for availability checking
          nightsAtDest
        );

        // If no campsites within 50 miles, try 100 miles for remote destinations
        if (nearbyCamps.length === 0) {
          nearbyCamps = await findNearbyCampsites(
            dest.coordinates.lat,
            dest.coordinates.lng,
            100,
            lodgingPref,
            destStartDate,
            nightsAtDest
          );
        }

        destinationCampsitesList.set(dest.id, nearbyCamps);
      }

      // Legacy: keep destinationCampsites map for backward compatibility (uses first/best campsite)
      const destinationCampsites: Map<string, TripStop> = new Map();
      for (const dest of config.destinations) {
        const nearbyCamps = destinationCampsitesList.get(dest.id) || [];
        if (nearbyCamps.length > 0) {
          const bestCamp = nearbyCamps[0];
          const campDescription = (lodgingPref === 'established' || lodgingPref === 'campground')
            ? bestCamp.note || 'Established campground'
            : bestCamp.note || 'Dispersed camping';
          destinationCampsites.set(dest.id, {
            id: bestCamp.id || `camp-base-${dest.id}`,
            name: bestCamp.name,
            type: 'camp',
            coordinates: { lat: bestCamp.lat, lng: bestCamp.lng },
            duration: 'Overnight',
            distance: `${bestCamp.distance.toFixed(1)} mi from ${dest.name}`,
            description: campDescription,
            day: 0,
            note: bestCamp.note,
            bookingUrl: bestCamp.bookingUrl,
            isReservable: bestCamp.isReservable,
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

      // Cap any single day's drive at the user's preference (default 8 hrs).
      const maxDrivingMinutes = (config.maxDrivingHoursPerDay ?? 8) * 60;
      const interpolateCoord = (
        from: { lat: number; lng: number },
        to: { lat: number; lng: number },
        fraction: number,
      ) => ({
        lat: from.lat + (to.lat - from.lat) * fraction,
        lng: from.lng + (to.lng - from.lng) * fraction,
      });

      // Process each destination
      for (let destIdx = 0; destIdx < numDestinations; destIdx++) {
        const dest = config.destinations[destIdx];
        let daysAtDest = daysPerDestination[destIdx];
        const prevPoint = destIdx === 0 ? config.startLocation : config.destinations[destIdx - 1];
        const campsite = destinationCampsites.get(dest.id);
        const availableHikes = destinationHikes.get(dest.id) || [];

        // If the leg from prevPoint to dest exceeds the daily drive cap,
        // break it into N travel days, each ending at a campsite near the
        // daily stopping point. The arrival day starts from that campsite.
        const fullLegDistance = getDistanceMiles(
          prevPoint.coordinates.lat,
          prevPoint.coordinates.lng,
          dest.coordinates.lat,
          dest.coordinates.lng,
        );
        const fullLegMinutes = (fullLegDistance / 45) * 60;

        let arrivalFromCoords: { lat: number; lng: number } = prevPoint.coordinates;
        let arrivalFromName = prevPoint.name;
        let arrivalLegDistance = fullLegDistance;
        let arrivalLegMinutes = fullLegMinutes;

        if (fullLegMinutes > maxDrivingMinutes) {
          // Insert as many travel days as needed to keep every day under the
          // user's max-drive cap. Travel days are added on top of the
          // destination's allotted days, so the trip total grows when a leg
          // is long. The TripDetail header surfaces this extension.
          const travelDaysToInsert = Math.floor(fullLegMinutes / maxDrivingMinutes);
          const segmentMiles = fullLegDistance * (maxDrivingMinutes / fullLegMinutes);

          for (let t = 0; t < travelDaysToInsert; t++) {
            const fraction = ((t + 1) * maxDrivingMinutes) / fullLegMinutes;
            const stopCoords = interpolateCoord(prevPoint.coordinates, dest.coordinates, fraction);

            // Find a campsite near the daily stopping point. Start tight,
            // expand if nothing comes back.
            let camps = await findNearbyCampsites(stopCoords.lat, stopCoords.lng, 30, lodgingPref);
            if (camps.length === 0) {
              camps = await findNearbyCampsites(stopCoords.lat, stopCoords.lng, 60, lodgingPref);
            }
            const camp = camps[0];

            // On a travel day the day-card already surfaces the drive
            // distance/time. When we found a campsite, that camp IS the
            // day's only meaningful stop — adding a separate "Drive toward X"
            // viewpoint just clutters the timeline. Fall back to the marker
            // only when no camp was found so the day isn't empty.
            const travelDayStops: TripStop[] = [];
            if (camp) {
              const campTypeDesc = (lodgingPref === 'established' || lodgingPref === 'campground')
                ? 'Established campground'
                : 'Dispersed camping';
              travelDayStops.push({
                id: camp.id || `travel-camp-${dayNumber}`,
                name: camp.name,
                type: 'camp',
                coordinates: { lat: camp.lat, lng: camp.lng },
                duration: 'Overnight',
                distance: `${camp.distance.toFixed(1)} mi off route`,
                description: camp.note || `Overnight stopover en route to ${dest.name} — ${campTypeDesc}`,
                day: dayNumber,
                note: camp.note,
                bookingUrl: camp.bookingUrl,
                isReservable: camp.isReservable,
              });
            } else {
              travelDayStops.push({
                id: `travel-${dayNumber}`,
                name: `Drive toward ${dest.name}`,
                type: 'viewpoint',
                coordinates: stopCoords,
                duration: `Day ${t + 1} of ${travelDaysToInsert + 1} on the road`,
                distance: `${Math.round(segmentMiles)} mi from ${arrivalFromName}`,
                description: `Long haul to ${dest.name} — no nearby campsite found, plan an overnight near this point`,
                day: dayNumber,
              });
            }

            days.push({
              day: dayNumber,
              stops: travelDayStops,
              campsite: travelDayStops.find(s => s.type === 'camp'),
              drivingDistance: `${Math.round(segmentMiles)} mi`,
              drivingTime: `${Math.floor(maxDrivingMinutes / 60)}h ${Math.round(maxDrivingMinutes % 60)}m`,
            });

            totalDistanceMiles += segmentMiles;
            totalDrivingMinutes += maxDrivingMinutes;
            dayNumber++;

            arrivalFromCoords = stopCoords;
            arrivalFromName = camp ? camp.name : `Day ${t + 1} stop`;
          }

          // Recompute the remaining leg from the last travel campsite to dest.
          arrivalLegDistance = getDistanceMiles(
            arrivalFromCoords.lat,
            arrivalFromCoords.lng,
            dest.coordinates.lat,
            dest.coordinates.lng,
          );
          arrivalLegMinutes = (arrivalLegDistance / 45) * 60;
        }

        for (let dayAtDest = 0; dayAtDest < daysAtDest; dayAtDest++) {
          const dayStops: TripStop[] = [];
          let dayDistanceMiles = 0;
          let dayDrivingMinutes = 0;
          const isArrivalDay = dayAtDest === 0;
          const isLastDayAtDest = dayAtDest === daysAtDest - 1;

          // On arrival day, add travel from previous point (or last travel
          // campsite if we inserted travel days above).
          if (isArrivalDay) {
            dayDistanceMiles += arrivalLegDistance;
            dayDrivingMinutes += arrivalLegMinutes;

            // Mark the arrival as the destination — the user is landing here
            // for the first time.
            const destinationStop: TripStop = {
              id: `dest-${dayNumber}`,
              name: dest.name,
              type: 'viewpoint',
              coordinates: dest.coordinates,
              duration: daysAtDest > 1 ? `Exploring (Day 1 of ${daysAtDest})` : '1-2h explore',
              distance: `${arrivalLegDistance.toFixed(0)} mi from ${arrivalFromName}`,
              description: dest.address,
              day: dayNumber,
              placeId: dest.placeId,
            };
            dayStops.push(destinationStop);
          } else if (dest.exploreTown) {
            // Extra day with town-exploration opt-in: surface a real activity
            // stop so the day reads as "time in {town}" instead of just a
            // hike + camp.
            dayStops.push({
              id: `town-${dayNumber}`,
              name: `Time in ${dest.name}`,
              type: 'viewpoint',
              coordinates: dest.coordinates,
              duration: 'Half-day in town',
              distance: `Day ${dayAtDest + 1} of ${daysAtDest} at ${dest.name}`,
              description: `Wander downtown, grab a meal, browse local shops`,
              day: dayNumber,
              placeId: dest.placeId,
            });
          }
          // Otherwise the destination just acts as a geographic anchor — extra
          // days run on hike + same-camp overnight without a redundant pin.

          // Find a unique hike for this day (based on pace preference)
          let hike: TripStop | undefined;
          const shouldHikeToday = hikingDays.has(dayNumber);

          // Check if this is the final activity day (last day at last destination)
          // Skip activities if travelOnlyFinalDay is enabled
          const isFinalActivityDay = destIdx === numDestinations - 1 && isLastDayAtDest;
          const skipActivitiesForTravel = config.travelOnlyFinalDay && isFinalActivityDay;

          // Skip activities if driving time already exceeds 5 hours (arrival/long travel days)
          const skipActivitiesForLongDrive = dayDrivingMinutes >= 300;

          if (shouldHikeToday && availableHikes.length > 0 && !skipActivitiesForTravel && !skipActivitiesForLongDrive) {
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
          // EXCEPT: don't add campsite on the final day (they're either at their end point or heading home)
          const isLastDayOfTrip = destIdx === numDestinations - 1 && isLastDayAtDest;

          if (!isLastDayOfTrip) {
            // Get all available campsites for this destination
            const destCampsites = destinationCampsitesList.get(dest.id) || [];

            // Calculate the specific date for this night
            let nightDate: string | undefined;
            if (config.startDate) {
              const startDate = new Date(config.startDate);
              startDate.setDate(startDate.getDate() + dayNumber - 1);
              nightDate = startDate.toISOString().split('T')[0];
            }

            // Helper to check if a campsite has availability for this specific night
            const hasAvailabilityForNight = (camp: CampsiteWithBooking): boolean => {
              if (!nightDate || !camp.perNightAvailability) return false;
              const nightAvail = camp.perNightAvailability.find(n => n.date === nightDate);
              return nightAvail ? nightAvail.availableSites > 0 : false;
            };

            // Sort campsites: ones with availability for this night first
            const sortedCamps = [...destCampsites].sort((a, b) => {
              const aHasAvail = hasAvailabilityForNight(a);
              const bHasAvail = hasAvailabilityForNight(b);

              if (aHasAvail && !bHasAvail) return -1;
              if (!aHasAvail && bHasAvail) return 1;

              // Then prioritize RIDB over other sources
              const aIsRidb = a.id.startsWith('ridb-') ? 1 : 0;
              const bIsRidb = b.id.startsWith('ridb-') ? 1 : 0;
              if (aIsRidb !== bIsRidb) return bIsRidb - aIsRidb;

              // Then prioritize national park campgrounds
              const aNP = a.isNationalPark ? 1 : 0;
              const bNP = b.isNationalPark ? 1 : 0;
              if (aNP !== bNP) return bNP - aNP;

              return a.distance - b.distance;
            });

            const campToUse = sortedCamps[0];
            if (campToUse) {
              const hasAvail = hasAvailabilityForNight(campToUse);
              const campTypeDesc = (lodgingPref === 'established' || lodgingPref === 'campground') ? 'Established campground' : 'Dispersed camping';

              let description = campToUse.note || campTypeDesc;
              if (hasAvail && nightDate) {
                const nightAvail = campToUse.perNightAvailability?.find(n => n.date === nightDate);
                description = `✓ ${nightAvail?.availableSites} sites available - ${campTypeDesc}`;
              }

              const campsiteForDay: TripStop = {
                id: campToUse.id,
                name: campToUse.name,
                type: 'camp',
                coordinates: { lat: campToUse.lat, lng: campToUse.lng },
                duration: 'Overnight',
                distance: `${campToUse.distance.toFixed(1)} mi from ${dest.name}`,
                description,
                day: dayNumber,
                note: campToUse.note,
                bookingUrl: campToUse.bookingUrl,
                isReservable: campToUse.isReservable || hasAvail,
              };
              dayStops.push(campsiteForDay);
            } else if (campsite) {
              // Fallback to pre-computed campsite
              const campsiteForDay: TripStop = {
                ...campsite,
                id: campsite.id,
                day: dayNumber,
                description: daysAtDest > 1
                  ? `${campsite.note || 'Dispersed camping'} (same camp for ${daysAtDest} nights)`
                  : campsite.note || 'Dispersed camping',
              };
              dayStops.push(campsiteForDay);
            }
          }

          // Mark the last stop of the trip as 'end' type when not returning to start
          // (If returning to start, the return stop will be added later with 'end' type)
          if (isLastDayOfTrip && !config.returnToStart && dayStops.length > 0) {
            // Find the destination/viewpoint stop and mark it as end
            const destStop = dayStops.find(s => s.type === 'viewpoint');
            if (destStop) {
              destStop.type = 'end';
              destStop.duration = 'Trip complete';
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

      // If returning to start, add return distance to totals and update last day
      // Note: We don't create a separate return day - all days are at destinations
      if (config.returnToStart && days.length > 0) {
        const lastDest = config.destinations[numDestinations - 1];
        const returnDistance = getDistanceMiles(
          lastDest.coordinates.lat,
          lastDest.coordinates.lng,
          config.startLocation.coordinates.lat,
          config.startLocation.coordinates.lng
        );
        const returnDrivingMinutes = (returnDistance / 45) * 60;

        // Add return travel info to the last day
        const lastDay = days[days.length - 1];
        const lastDayDistance = parseInt(lastDay.drivingDistance?.replace(/[^\d]/g, '') || '0');
        const lastDayMinutes = (lastDayDistance / 45) * 60;

        lastDay.drivingDistance = `${Math.round(lastDayDistance + returnDistance)} mi`;
        lastDay.drivingTime = `${Math.round((lastDayMinutes + returnDrivingMinutes) / 60)}h ${Math.round((lastDayMinutes + returnDrivingMinutes) % 60)}m`;

        // Add return stop to last day
        const returnStop: TripStop = {
          id: `return-${lastDay.day}`,
          name: `Return to ${config.startLocation.name}`,
          type: 'end',
          coordinates: config.startLocation.coordinates,
          duration: 'Trip complete',
          distance: `${returnDistance.toFixed(0)} mi return`,
          description: `Return drive from ${lastDest.name}`,
          day: lastDay.day,
          placeId: config.startLocation.placeId,
        };
        lastDay.stops.push(returnStop);

        totalDistanceMiles += returnDistance;
        totalDrivingMinutes += returnDrivingMinutes;
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
