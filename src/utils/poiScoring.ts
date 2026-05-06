/**
 * POI scoring for trip-day integration.
 *
 * Scores candidate POIs (from the local trip-engine database) against a
 * planned trip day on three axes:
 *   - spatial   : distance to that day's campsite or driving polyline
 *   - temporal  : estimated time on the POI vs. activity window left in the day
 *   - user fit  : hiking/biking skill level + vehicle capability
 * Plus a small popularity boost.
 *
 * Pure module — no React, no fetches. Inputs come from the database row and
 * the trip config; outputs are scores + reasons for a UI panel.
 */

import type { ActivityType, DifficultyLevel, VehicleType } from '@/types/trip';
import { estimateDrivingFromHaversine } from '@/utils/drivingInfo';

export interface NearbyPoi {
  id: string;
  canonical_name: string;
  poi_type: string;
  lat: number;
  lng: number;
  distance_miles: number;
  source_count: number;
  photo_count: number;
  is_hidden_gem: boolean;
  locationscout_endorsed: boolean;
  metadata_tags: Record<string, any> | null;
  sources: any[] | null;
}

export interface DayContext {
  /** Today's campsite (lat/lng). Used for the closer-of-two distance test. */
  campsite: { lat: number; lng: number } | null;
  /** Polyline of the drive from yesterday's camp to today's camp. */
  routePoints: Array<{ lat: number; lng: number }>;
  /** Activity time available, in minutes (window after subtracting drive). */
  activityWindowMinutes: number;
}

export interface UserFit {
  vehicleType?: VehicleType;
  hikingDifficulty?: DifficultyLevel;
  bikingDifficulty?: DifficultyLevel;
  selectedActivities: ActivityType[];
}

export interface PoiScore {
  score_0_100: number;
  breakdown: {
    spatial: number;
    temporal: number;
    fit: number;
    popularity: number;
  };
  /** Total committed time = on-site time + round-trip drive estimate. */
  estimated_minutes: number;
  on_site_minutes: number;
  /** One-way drive estimate from campsite (haversine × road factor). */
  drive_minutes_one_way: number;
  distance_from_camp_mi: number | null;
  distance_from_route_mi: number | null;
  matched_activity: ActivityType | null;
  reasons: string[];
  warnings: string[];
}

export interface ScoredPoi {
  poi: NearbyPoi;
  score: PoiScore;
}

// ---------------------------------------------------------------------------
// Spatial helpers
// ---------------------------------------------------------------------------

const EARTH_MI = 3958.8;

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Closest distance from POI to any segment of the route polyline. Equirectangular
 * approximation — fine at trip-day scale (tens of miles).
 */
function distanceToRouteMiles(
  poi: { lat: number; lng: number },
  route: Array<{ lat: number; lng: number }>,
): number | null {
  if (route.length < 2) return null;
  const cosLat = Math.cos((poi.lat * Math.PI) / 180);
  const toXY = (p: { lat: number; lng: number }) => ({
    x: p.lng * cosLat,
    y: p.lat,
  });
  const P = toXY(poi);
  let best = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const A = toXY(route[i]);
    const B = toXY(route[i + 1]);
    const ABx = B.x - A.x;
    const ABy = B.y - A.y;
    const APx = P.x - A.x;
    const APy = P.y - A.y;
    const ab2 = ABx * ABx + ABy * ABy;
    const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (APx * ABx + APy * ABy) / ab2));
    const Cx = A.x + t * ABx;
    const Cy = A.y + t * ABy;
    const dx = P.x - Cx;
    const dy = P.y - Cy;
    const degMiles = 69; // 1° lat ≈ 69 mi
    const d = Math.sqrt(dx * dx + dy * dy) * degMiles;
    if (d < best) best = d;
  }
  return Number.isFinite(best) ? best : null;
}

// ---------------------------------------------------------------------------
// POI type → activity mapping + duration estimator
// ---------------------------------------------------------------------------

const TYPE_TO_ACTIVITY: Array<[RegExp, ActivityType]> = [
  [/hike|trail|hiking|trekking|footpath|footway|path|pedestrian/i, 'hiking'],
  [/mtb|mountain.?bike|cycle|bike/i, 'biking'],
  [/ohv|4wd|jeep|offroad/i, 'offroading'],
  [/scenic.?drive|byway|panoram/i, 'scenic_driving'],
  [/lake|beach|swim|water|river|waterfall|spring/i, 'water'],
  [/climb|crag|boulder/i, 'climbing'],
  [/fish/i, 'fishing'],
  [/viewpoint|overlook|vista|view|photo/i, 'photography'],
  [/arch|peak|summit|natural|gem|highlight/i, 'photography'],
];

function matchActivityForPoi(poi: NearbyPoi): ActivityType | null {
  // Prefer explicit activity_tags from enrichment when present.
  const activityTags = poi.metadata_tags?.activity_tags;
  if (Array.isArray(activityTags)) {
    for (const tag of activityTags) {
      const t = String(tag).toLowerCase();
      if (t.includes('hik')) return 'hiking';
      if (t.includes('bike') || t.includes('mtb')) return 'biking';
      if (t.includes('climb')) return 'climbing';
      if (t.includes('fish')) return 'fishing';
      if (t.includes('water') || t.includes('swim')) return 'water';
      if (t.includes('photo') || t.includes('view')) return 'photography';
      if (t.includes('scenic') || t.includes('drive')) return 'scenic_driving';
      if (t.includes('ohv') || t.includes('offroad')) return 'offroading';
    }
  }
  for (const [re, activity] of TYPE_TO_ACTIVITY) {
    if (re.test(poi.poi_type)) return activity;
  }
  return null;
}

/**
 * Trail length in miles from various enrichment sources. Returns null if
 * unknown — caller falls back to a time default by activity type.
 */
function trailLengthMiles(poi: NearbyPoi): number | null {
  const t = poi.metadata_tags ?? {};
  const osm = (t as any).osm_tags ?? {};
  const candidates = [
    osm.distance, // sometimes set as "5 km" / "3.2 mi"
    osm.length,   // meters (string)
    (t as any).length_mi,
    (t as any).length_miles,
  ];
  for (const raw of candidates) {
    if (raw == null) continue;
    const s = String(raw).trim().toLowerCase();
    const num = parseFloat(s);
    if (!Number.isFinite(num)) continue;
    if (s.includes('km')) return num * 0.621371;
    if (s.includes('mi')) return num;
    // OSM `length` is meters when numeric and on a way.
    if (s === String(num)) return num / 1609.344;
  }
  return null;
}

const HIKE_MINUTES_PER_MILE: Record<DifficultyLevel, number> = {
  easy: 25,
  moderate: 35,
  hard: 50,
};

const DEFAULT_MINUTES: Record<ActivityType, number> = {
  hiking: 120,        // when length unknown
  biking: 90,
  photography: 60,
  offroading: 120,
  water: 90,
  scenic_driving: 60,
  climbing: 120,
  fishing: 120,
  wildlife: 60,
};

function estimateMinutes(poi: NearbyPoi, activity: ActivityType, fit: UserFit): number {
  if (activity === 'hiking') {
    const miles = trailLengthMiles(poi);
    if (miles != null) {
      const pace = HIKE_MINUTES_PER_MILE[fit.hikingDifficulty ?? 'moderate'];
      return Math.round(miles * pace);
    }
  }
  return DEFAULT_MINUTES[activity];
}

// ---------------------------------------------------------------------------
// Difficulty + vehicle gates
// ---------------------------------------------------------------------------

const DIFFICULTY_RANK: Record<DifficultyLevel, number> = { easy: 1, moderate: 2, hard: 3 };

function poiHikeDifficulty(poi: NearbyPoi): DifficultyLevel | null {
  const t = poi.metadata_tags ?? {};
  const ugrc = (t as any).ugrc_difficulty_hike;
  if (typeof ugrc === 'string') {
    const u = ugrc.toLowerCase();
    if (u.includes('easy')) return 'easy';
    if (u.includes('moder')) return 'moderate';
    if (u.includes('diff') || u.includes('hard')) return 'hard';
  }
  const sac = ((t as any).osm_tags ?? {}).sac_scale;
  if (typeof sac === 'string') {
    const m = sac.match(/T(\d)/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n <= 1) return 'easy';
      if (n <= 3) return 'moderate';
      return 'hard';
    }
  }
  return null;
}

function poiBikeDifficulty(poi: NearbyPoi): DifficultyLevel | null {
  const t = poi.metadata_tags ?? {};
  const ugrc = (t as any).ugrc_difficulty_bike;
  if (typeof ugrc === 'string') {
    const u = ugrc.toLowerCase();
    if (u.includes('easy') || u.includes('begin')) return 'easy';
    if (u.includes('inter') || u.includes('moder')) return 'moderate';
    if (u.includes('adv') || u.includes('exp') || u.includes('diff')) return 'hard';
  }
  const mtb = ((t as any).osm_tags ?? {})['mtb:scale'];
  if (typeof mtb === 'string') {
    const m = mtb.match(/^(\d)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n <= 1) return 'easy';
      if (n <= 3) return 'moderate';
      return 'hard';
    }
  }
  return null;
}

const VEHICLE_RANK: Record<VehicleType, number> = { sedan: 1, suv: 2, '4wd': 3, rv: 1 };

interface VehicleGateResult {
  blocked: boolean;
  warning: string | null;
}

function vehicleGate(poi: NearbyPoi, vehicle: VehicleType | undefined): VehicleGateResult {
  if (!vehicle) return { blocked: false, warning: null };
  const osm = (poi.metadata_tags as any)?.osm_tags ?? {};
  const ugrcSurface = (poi.metadata_tags as any)?.ugrc_surface;

  const fourWdOnly = String(osm['4wd_only'] ?? '').toLowerCase() === 'yes'
    || String(osm['hgv'] ?? '').toLowerCase() === 'no'
    || String(osm.smoothness ?? '').toLowerCase().includes('horrible');
  if (fourWdOnly && VEHICLE_RANK[vehicle] < 3) {
    return { blocked: true, warning: 'Requires 4WD' };
  }

  const surface = String(osm.surface ?? ugrcSurface ?? '').toLowerCase();
  const roughSurface = surface && /dirt|gravel|unpaved|ground|sand|rock/.test(surface);
  if (roughSurface && vehicle === 'sedan') {
    return { blocked: false, warning: 'Rough surface — sedan may struggle' };
  }
  if (roughSurface && vehicle === 'rv') {
    return { blocked: false, warning: 'Rough surface — not RV-friendly' };
  }
  return { blocked: false, warning: null };
}

// ---------------------------------------------------------------------------
// Score components
// ---------------------------------------------------------------------------

const SOFT_SPATIAL_MI = 5;   // anything inside this is a 1.0
const HARD_SPATIAL_MI = 30;  // beyond this we drop the candidate

function spatialScore(distMi: number): number {
  if (distMi <= SOFT_SPATIAL_MI) return 1;
  if (distMi >= HARD_SPATIAL_MI) return 0;
  return 1 - (distMi - SOFT_SPATIAL_MI) / (HARD_SPATIAL_MI - SOFT_SPATIAL_MI);
}

function temporalScore(estMin: number, windowMin: number): number {
  if (windowMin <= 0) return 0;
  if (estMin <= windowMin) return 1;
  const ratio = windowMin / estMin;
  return Math.max(0, ratio);
}

function popularityScore(poi: NearbyPoi): number {
  const sources = Math.min(1, Math.max(0, poi.source_count - 1) / 5);
  const photos = Math.min(1, poi.photo_count / 50);
  const gem = poi.is_hidden_gem ? 0.2 : 0;
  const endorsed = poi.locationscout_endorsed ? 0.1 : 0;
  return Math.min(1, sources * 0.5 + photos * 0.3 + gem + endorsed);
}

// ---------------------------------------------------------------------------
// Main scoring entry point
// ---------------------------------------------------------------------------

export interface ScoreOptions {
  /** Hard cutoff for temporal fit (estimated_minutes / window). Default 1.25. */
  temporalRejectRatio?: number;
}

export function scorePoi(
  poi: NearbyPoi,
  day: DayContext,
  fit: UserFit,
  opts: ScoreOptions = {},
): PoiScore | null {
  const matched = matchActivityForPoi(poi);
  if (!matched) return null;
  if (!fit.selectedActivities.includes(matched)) return null;

  // Spatial
  const dCamp = day.campsite ? haversineMiles(day.campsite, poi) : null;
  const dRoute = distanceToRouteMiles(poi, day.routePoints);
  const dEffective = Math.min(
    dCamp ?? Infinity,
    dRoute ?? Infinity,
  );
  if (!Number.isFinite(dEffective) || dEffective >= HARD_SPATIAL_MI) return null;
  const spatial = spatialScore(dEffective);

  // Temporal — total committed = on-site time + round-trip drive estimate
  // from the campsite (haversine × road-factor heuristic; refined by Google
  // Directions when the user actually adds the POI).
  const onSiteMin = estimateMinutes(poi, matched, fit);
  const driveOneWay = day.campsite
    ? estimateDrivingFromHaversine(day.campsite.lat, day.campsite.lng, poi.lat, poi.lng)
        .durationMinutes
    : 0;
  const estMin = onSiteMin + driveOneWay * 2;
  const reject = opts.temporalRejectRatio ?? 1.25;
  if (day.activityWindowMinutes > 0 && estMin > day.activityWindowMinutes * reject) {
    return null;
  }
  const temporal = temporalScore(estMin, day.activityWindowMinutes);

  // User fit
  const reasons: string[] = [];
  const warnings: string[] = [];
  let fitScore = 1;

  if (matched === 'hiking' && fit.hikingDifficulty) {
    const poiDiff = poiHikeDifficulty(poi);
    if (poiDiff) {
      if (DIFFICULTY_RANK[poiDiff] > DIFFICULTY_RANK[fit.hikingDifficulty]) {
        return null;
      }
      reasons.push(`${poiDiff} hike`);
    }
  }
  if (matched === 'biking' && fit.bikingDifficulty) {
    const poiDiff = poiBikeDifficulty(poi);
    if (poiDiff) {
      if (DIFFICULTY_RANK[poiDiff] > DIFFICULTY_RANK[fit.bikingDifficulty]) {
        return null;
      }
      reasons.push(`${poiDiff} ride`);
    }
  }
  const veh = vehicleGate(poi, fit.vehicleType);
  if (veh.blocked) return null;
  if (veh.warning) {
    warnings.push(veh.warning);
    fitScore -= 0.2;
  }

  const popularity = popularityScore(poi);

  // Reasons (small, human)
  if (dCamp != null && dCamp <= SOFT_SPATIAL_MI) {
    reasons.push(`${dCamp.toFixed(1)} mi from camp`);
  } else if (dRoute != null && dRoute <= SOFT_SPATIAL_MI) {
    reasons.push(`${dRoute.toFixed(1)} mi off route`);
  } else {
    reasons.push(`${dEffective.toFixed(1)} mi away`);
  }
  reasons.push(formatMinutes(estMin));
  if (poi.is_hidden_gem) reasons.push('Hidden gem');
  else if (poi.source_count >= 3) reasons.push(`${poi.source_count} sources confirm`);
  else if (poi.photo_count >= 20) reasons.push(`${poi.photo_count} photos nearby`);

  const score = Math.round(
    100 * (spatial * 0.4 + temporal * 0.3 + fitScore * 0.2 + popularity * 0.1),
  );

  return {
    score_0_100: Math.max(0, Math.min(100, score)),
    breakdown: { spatial, temporal, fit: fitScore, popularity },
    estimated_minutes: estMin,
    on_site_minutes: onSiteMin,
    drive_minutes_one_way: driveOneWay,
    distance_from_camp_mi: dCamp,
    distance_from_route_mi: dRoute,
    matched_activity: matched,
    reasons,
    warnings,
  };
}

export function scorePois(
  pois: NearbyPoi[],
  day: DayContext,
  fit: UserFit,
  opts: ScoreOptions = {},
): ScoredPoi[] {
  const scored: ScoredPoi[] = [];
  for (const poi of pois) {
    const score = scorePoi(poi, day, fit, opts);
    if (score) scored.push({ poi, score });
  }
  scored.sort((a, b) => b.score.score_0_100 - a.score.score_0_100);
  return scored;
}

function formatMinutes(min: number): string {
  if (min < 60) return `~${min} min`;
  const h = min / 60;
  if (Number.isInteger(h)) return `~${h}h`;
  return `~${h.toFixed(1)}h`;
}
