/**
 * Generator-side trip picking.
 *
 * Used inside `use-trip-generator.ts` to fill each day's stops from the
 * trip-engine database (`points_of_interest` + `spots`) instead of the
 * legacy Google Places + RIDB + OSM-Overpass mix.
 *
 * Activity-first anchoring: the day's activities are picked first, then the
 * camp is anchored at the longest activity's coords (per user preference).
 * Travel days skip activities and anchor the camp on the route midpoint.
 */

import { supabase } from '@/integrations/supabase/client';
import {
  scorePois,
  type DayContext,
  type NearbyPoi,
  type ScoredPoi,
  type UserFit,
} from '@/utils/poiScoring';
import {
  scoreCampsites,
  type CampsiteCandidate,
  type CampsiteSource,
  type ScoredCampsite,
} from '@/utils/campsiteScoring';
import { estimateDrivingFromHaversine, getDrivingInfo, formatDrivingTime } from '@/utils/drivingInfo';
import type { ActivityType, LodgingType, TripConfig, TripStop } from '@/types/trip';
import type { StopType } from '@/types/maps';

const POI_RADIUS_MILES = 30;
const SPOTS_RADIUS_MILES = 50;
const DEFAULT_ACTIVITY_WINDOW_MIN = 9 * 60;
const ACTIVITIES_PER_DAY = 2;

const ACTIVITY_TO_STOP: Record<ActivityType, StopType> = {
  hiking: 'hike',
  biking: 'hike',
  photography: 'viewpoint',
  offroading: 'hike',
  water: 'water',
  scenic_driving: 'viewpoint',
  climbing: 'hike',
  fishing: 'water',
  wildlife: 'viewpoint',
};

const KIND_FOR_LODGING: Record<LodgingType, string[] | null> = {
  dispersed: ['dispersed_camping', 'informal_camping'],
  campground: ['established_campground'],
  cabin: null,
  hotel: null,
  mixed: null,
  other: null,
};

function fmtMin(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

function diversifyByActivity(
  scored: ScoredPoi[],
  selected: ActivityType[],
  max: number,
): ScoredPoi[] {
  const buckets = new Map<ActivityType, ScoredPoi[]>();
  for (const a of selected) buckets.set(a, []);
  for (const c of scored) {
    const a = c.score.matched_activity;
    if (a && buckets.has(a)) buckets.get(a)!.push(c);
  }
  const out: ScoredPoi[] = [];
  let added = true;
  while (out.length < max && added) {
    added = false;
    for (const a of selected) {
      const list = buckets.get(a);
      if (list && list.length > 0 && out.length < max) {
        out.push(list.shift()!);
        added = true;
      }
    }
  }
  return out;
}

function scoredPoiToTripStop(c: ScoredPoi, dayNumber: number, anchor: { lat: number; lng: number }): TripStop {
  const matched = c.score.matched_activity ?? 'photography';
  const drive = estimateDrivingFromHaversine(anchor.lat, anchor.lng, c.poi.lat, c.poi.lng);
  return {
    id: `poi-${dayNumber}-${c.poi.id}`,
    name: c.poi.canonical_name,
    type: ACTIVITY_TO_STOP[matched],
    coordinates: { lat: c.poi.lat, lng: c.poi.lng },
    duration: fmtMin(c.score.on_site_minutes),
    distance: `${drive.distanceMiles.toFixed(1)} mi drive`,
    drivingTime: formatDrivingTime(drive.durationMinutes, true),
    description: c.score.reasons.join(' · '),
    day: dayNumber,
  };
}

function spotSubSource(row: { source: string | null; sub_kind: string | null }): CampsiteSource {
  if (row.sub_kind === 'known') return 'spot_known';
  if (row.source === 'community') return 'spot_community';
  if (row.sub_kind === 'derived' || row.source === 'osm' || row.source === 'mvum') return 'spot_derived';
  if (row.source === 'ridb') return 'ridb';
  return 'spot_unknown';
}

interface NearbySpotRow {
  id: string;
  name: string | null;
  description: string | null;
  lat: number;
  lng: number;
  distance_miles: number;
  kind: string | null;
  sub_kind: string | null;
  source: string | null;
  public_land_unit: string | null;
  public_land_manager: string | null;
  public_land_designation: string | null;
  public_access: string | null;
  land_type: string | null;
  amenities: Record<string, any> | null;
  extra: Record<string, any> | null;
}


// ---------------------------------------------------------------------------
// pickActivitiesForDay
// ---------------------------------------------------------------------------

export interface PickActivitiesArgs {
  anchor: { lat: number; lng: number };
  config: TripConfig;
  dayNumber: number;
  routePoints: Array<{ lat: number; lng: number }>;
  /** Already-committed minutes for the day (drive in, prior activities). */
  committedMinutes: number;
  excludeIds: Set<string>;
}

export interface PickActivitiesResult {
  activities: TripStop[];
  /** POI ids consumed; caller updates the running excludeIds set. */
  consumedIds: string[];
  /** Coords of the longest-time activity, used to anchor the camp. Null if
   *  no activities were found / picked. */
  campAnchor: { lat: number; lng: number } | null;
}

export async function pickActivitiesForDay({
  anchor,
  config,
  dayNumber,
  routePoints,
  committedMinutes,
  excludeIds,
}: PickActivitiesArgs): Promise<PickActivitiesResult> {
  const selected = (config.activities ?? []) as ActivityType[];
  if (selected.length === 0) {
    return { activities: [], consumedIds: [], campAnchor: null };
  }

  const { data, error } = await supabase.rpc('nearby_points_of_interest' as never, {
    p_lat: anchor.lat,
    p_lng: anchor.lng,
    p_radius_miles: POI_RADIUS_MILES,
  } as never);
  if (error) {
    console.error('[pickActivitiesForDay] RPC error', error);
    return { activities: [], consumedIds: [], campAnchor: null };
  }

  const fresh = ((data ?? []) as unknown as NearbyPoi[]).filter((p) => !excludeIds.has(p.id));
  const fit: UserFit = {
    vehicleType: config.vehicleType,
    hikingDifficulty: config.hikingDifficulty,
    bikingDifficulty: config.bikingDifficulty,
    selectedActivities: selected,
  };
  const dayContext: DayContext = {
    campsite: { lat: anchor.lat, lng: anchor.lng },
    routePoints,
    activityWindowMinutes: Math.max(60, DEFAULT_ACTIVITY_WINDOW_MIN - committedMinutes),
  };
  const scored = scorePois(fresh, dayContext, fit);
  if (scored.length === 0) return { activities: [], consumedIds: [], campAnchor: null };

  const top = diversifyByActivity(scored, selected, ACTIVITIES_PER_DAY);
  if (top.length === 0) return { activities: [], consumedIds: [], campAnchor: null };

  const activities = top.map((c) => scoredPoiToTripStop(c, dayNumber, anchor));
  const consumedIds = top.map((c) => c.poi.id);

  // Anchor camp at the longest-time activity (matches the user's preference).
  const longest = top.reduce((acc, c) =>
    c.score.on_site_minutes > acc.score.on_site_minutes ? c : acc,
  );
  return {
    activities,
    consumedIds,
    campAnchor: { lat: longest.poi.lat, lng: longest.poi.lng },
  };
}

// ---------------------------------------------------------------------------
// pickCampsiteForDay
// ---------------------------------------------------------------------------

export interface PickCampsiteArgs {
  anchor: { lat: number; lng: number };
  config: TripConfig;
  dayNumber: number;
  excludeIds: Set<string>;
  /** RIDB-bookable rows pre-fetched by the caller (only when applicable). */
  ridbCandidates?: CampsiteCandidate[];
  radiusMiles?: number;
}

export interface PickCampsiteResult {
  camp: TripStop | null;
  scored: ScoredCampsite | null;
}

export async function pickCampsiteForDay({
  anchor,
  config,
  dayNumber,
  excludeIds,
  ridbCandidates,
  radiusMiles = SPOTS_RADIUS_MILES,
}: PickCampsiteArgs): Promise<PickCampsiteResult> {
  // Auto-generation always picks dispersed (Known + Community + OSM-derived)
  // — the user's preference for "established" only applies in the swap
  // modal where they can opt in explicitly. Strictly `dispersed_camping`,
  // not `informal_camping` (those are roadside/parking-lot fallbacks).
  const kinds = ['dispersed_camping'];

  const spotsPromise = supabase.rpc('nearby_spots' as never, {
    p_lat: anchor.lat,
    p_lng: anchor.lng,
    p_radius_miles: radiusMiles,
    p_kinds: kinds,
  } as never);

  const spotsRes = await spotsPromise;
  if (spotsRes.error) {
    console.error('[pickCampsiteForDay] spots RPC', spotsRes.error);
  }

  const allSpotRows = (spotsRes.data ?? []) as unknown as NearbySpotRow[];

  // Strict filter for dispersed mode: `dispersed_camping` rows whose sub_kind
  // is exactly `known` or `community`. No derived/wild/pullout/etc. The name
  // guardrail catches rows mis-classified upstream (e.g. real campgrounds
  // tagged as known dispersed).
  // Drop rows where the pipeline already flagged this dispersed entry as
  // an established campground via `extra.derivation_reasons`. Same physical
  // location is also indexed under `established_campground` and shouldn't
  // surface in dispersed mode.
  const spotRows = allSpotRows.filter((r) => {
    if (r.kind !== 'dispersed_camping') return false;
    if (r.sub_kind !== 'known' && r.sub_kind !== 'community') return false;
    const reasons = (r.extra as any)?.derivation_reasons;
    if (Array.isArray(reasons) && reasons.some((x) => /established\s+campground/i.test(String(x)))) {
      return false;
    }
    return true;
  });

  const fromSpots: CampsiteCandidate[] = spotRows.map((r) => ({
    id: r.id,
    name: r.name ?? 'Unnamed spot',
    lat: r.lat,
    lng: r.lng,
    distance_miles: r.distance_miles,
    source: spotSubSource({ source: r.source, sub_kind: r.sub_kind }),
    kind: r.kind ?? undefined,
    sub_kind: r.sub_kind ?? undefined,
    description: r.description,
    amenities: r.amenities,
    extra: r.extra,
    public_access: r.public_access,
    land_type: r.land_type,
    public_land_manager: r.public_land_manager,
  }));

  const merged = [...fromSpots, ...(ridbCandidates ?? [])].filter(
    (c) => !excludeIds.has(c.id),
  );

  // Force lodgingPreference='dispersed' so the lodging gate inside the
  // scorer accepts dispersed kinds even when the trip's overall preference
  // is something else.
  const scored = scoreCampsites(merged, anchor, {
    vehicleType: config.vehicleType,
    lodgingPreference: 'dispersed',
  });
  console.log(
    `[pickCampsiteForDay] day ${dayNumber} anchor=${anchor.lat.toFixed(4)},${anchor.lng.toFixed(4)} ` +
    `vehicle=${config.vehicleType ?? 'none'} → ` +
    `RPC ${allSpotRows.length} → filtered ${spotRows.length} → merged ${merged.length} → scored ${scored.length}`,
  );
  if (scored.length === 0) {
    console.warn(`[pickCampsiteForDay] day ${dayNumber} no scored candidates — camp will be null`);
    return { camp: null, scored: null };
  }

  // Haversine ranking is wildly wrong in canyon terrain — a site that's 1.5 mi
  // straight-line can be a 30+ minute drive around a rim. Take the top-K by
  // haversine, fetch real Google Directions for each in parallel, drop
  // unreachable ones, and re-rank by actual drive minutes.
  const TOP_K_FOR_REFINE = 5;
  const topK = scored.slice(0, TOP_K_FOR_REFINE);
  const drives = await Promise.all(
    topK.map((sc) =>
      getDrivingInfo(anchor.lat, anchor.lng, sc.campsite.lat, sc.campsite.lng, sc.campsite.name),
    ),
  );

  const refined: ScoredCampsite[] = [];
  topK.forEach((sc, i) => {
    const d = drives[i];
    if (!d.isReachable) return;
    // Map drive minutes to a 0..1 spatial component (was miles-based).
    // ≤15 min = full marks; 90+ min = 0; linear in between.
    const driveMin = d.durationMinutes;
    const driveSpatial = driveMin <= 15 ? 1 : driveMin >= 90 ? 0 : 1 - (driveMin - 15) / 75;
    const newScore = Math.round(
      100 *
        (driveSpatial * 0.4 +
          sc.score.breakdown.lodging_fit * 0.2 +
          sc.score.breakdown.vehicle * 0.2 +
          sc.score.breakdown.source * 0.15 +
          sc.score.breakdown.land * 0.05),
    );
    refined.push({
      campsite: { ...sc.campsite, distance_miles: d.distanceMiles },
      score: {
        ...sc.score,
        score_0_100: Math.max(0, Math.min(100, newScore)),
        drive_minutes_one_way: driveMin,
        breakdown: { ...sc.score.breakdown, spatial: driveSpatial },
      },
    });
  });

  const finalRanked = refined.length > 0 ? refined : scored;
  finalRanked.sort((a, b) => b.score.score_0_100 - a.score.score_0_100);
  console.log(
    `[pickCampsiteForDay] day ${dayNumber} reachable ${refined.length}/${topK.length}, ` +
    `top: ${finalRanked[0]?.campsite.name} score=${finalRanked[0]?.score.score_0_100} drive=${finalRanked[0]?.score.drive_minutes_one_way}min`,
  );

  const top = finalRanked[0];
  const c = top.campsite;
  const camp: TripStop = {
    id: c.id,
    name: c.name,
    type: 'camp',
    coordinates: { lat: c.lat, lng: c.lng },
    duration: 'Overnight',
    distance: `${c.distance_miles.toFixed(1)} mi drive from anchor`,
    drivingTime: formatDrivingTime(top.score.drive_minutes_one_way, true),
    description: c.description ?? top.score.reasons.join(' · '),
    day: dayNumber,
    note: c.description ?? undefined,
    bookingUrl: c.bookingUrl,
    isReservable: c.hasAvailability,
  };
  return { camp, scored: top };
}
