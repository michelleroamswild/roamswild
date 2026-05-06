/**
 * Campsite scoring for trip-day integration.
 *
 * Ranks campsite candidates pulled from three sources:
 *   - the user's saved sites (`campsites` table)
 *   - public spots (`spots` table via the `nearby_spots` RPC)
 *   - RIDB-bookable established campgrounds (only when lodging = campground)
 *
 * Same shape as POI scoring but with weights tuned for camp selection:
 *   spatial 0.40 + lodging fit 0.20 + vehicle 0.20 + source 0.15 + land 0.05
 */

import type { LodgingType, VehicleType } from '@/types/trip';
import { estimateDrivingFromHaversine } from '@/utils/drivingInfo';

// Normalized candidate shape — every source converts into this before scoring.
export type CampsiteSource =
  | 'user_saved' // your `campsites` table
  | 'spot_known'
  | 'spot_community'
  | 'spot_derived'
  | 'spot_unknown'
  | 'ridb';

export interface CampsiteCandidate {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distance_miles: number;
  source: CampsiteSource;
  /** Original kind from spots, e.g. 'dispersed_camping' or 'established_campground'. */
  kind?: string;
  sub_kind?: string;
  description?: string | null;
  amenities?: Record<string, any> | null;
  extra?: Record<string, any> | null;
  public_access?: string | null;
  land_type?: string | null;
  public_land_manager?: string | null;
  /** RIDB / availability fields, only set when source='ridb'. */
  bookingUrl?: string;
  hasAvailability?: boolean;
  availableSites?: number;
}

export interface DayAnchor {
  lat: number;
  lng: number;
}

export interface CampsiteFit {
  vehicleType?: VehicleType;
  lodgingPreference?: LodgingType;
}

export interface CampsiteScore {
  score_0_100: number;
  breakdown: {
    spatial: number;
    lodging_fit: number;
    vehicle: number;
    source: number;
    land: number;
  };
  drive_minutes_one_way: number;
  reasons: string[];
  warnings: string[];
}

export interface ScoredCampsite {
  campsite: CampsiteCandidate;
  score: CampsiteScore;
}

// ---------------------------------------------------------------------------
// Component scores
// ---------------------------------------------------------------------------

const SOFT_SPATIAL_MI = 5;
const HARD_SPATIAL_MI = 50;

function spatialScore(distMi: number): number {
  if (distMi <= SOFT_SPATIAL_MI) return 1;
  if (distMi >= HARD_SPATIAL_MI) return 0;
  return 1 - (distMi - SOFT_SPATIAL_MI) / (HARD_SPATIAL_MI - SOFT_SPATIAL_MI);
}

// Lodging preference → which kinds satisfy it.
const KIND_FOR_LODGING: Record<LodgingType, string[] | null> = {
  dispersed: ['dispersed_camping'],
  campground: ['established_campground'],
  cabin: null, // not represented in spots; user's saved sites only
  hotel: null,
  mixed: null, // any kind acceptable
  other: null,
};

function lodgingFitScore(candidate: CampsiteCandidate, fit: CampsiteFit): {
  score: number;
  blocked: boolean;
} {
  // User-saved sites always pass — they trust their own picks.
  if (candidate.source === 'user_saved') return { score: 1, blocked: false };

  const pref = fit.lodgingPreference;
  if (!pref || pref === 'mixed' || pref === 'other') return { score: 1, blocked: false };

  const allowed = KIND_FOR_LODGING[pref];
  if (allowed === null) {
    // cabin/hotel — spots don't represent these. Block public-spot candidates.
    return { score: 0, blocked: true };
  }
  if (candidate.kind && allowed.includes(candidate.kind)) return { score: 1, blocked: false };
  return { score: 0, blocked: true };
}

const VEHICLE_RANK: Record<VehicleType, number> = { sedan: 1, suv: 2, '4wd': 3, rv: 1 };

function vehicleScore(candidate: CampsiteCandidate, fit: CampsiteFit): {
  score: number;
  blocked: boolean;
  warning: string | null;
} {
  const veh = fit.vehicleType;
  if (!veh) return { score: 1, blocked: false, warning: null };

  const requiredRaw = String(candidate.amenities?.vehicle_required ?? '').toLowerCase();
  const surfaceRaw =
    String((candidate.extra as any)?.osm_tags?.surface ?? candidate.extra?.surface ?? '')
      .toLowerCase();

  const needsHighClearance =
    requiredRaw.includes('high_clearance') ||
    requiredRaw.includes('4wd') ||
    surfaceRaw.includes('rocky') ||
    String((candidate.extra as any)?.osm_tags?.smoothness ?? '').toLowerCase().includes('horrible');
  if (needsHighClearance && VEHICLE_RANK[veh] < 2) {
    return { score: 0, blocked: true, warning: 'Requires high-clearance / 4WD' };
  }
  if (needsHighClearance && veh === 'rv') {
    return { score: 0, blocked: true, warning: 'Not RV-accessible' };
  }

  const rough = surfaceRaw && /dirt|gravel|unpaved|ground|sand|rock/.test(surfaceRaw);
  if (rough && veh === 'sedan') return { score: 0.6, blocked: false, warning: 'Rough road — sedan may struggle' };
  if (rough && veh === 'rv')    return { score: 0.6, blocked: false, warning: 'Rough road — not RV-friendly' };
  return { score: 1, blocked: false, warning: null };
}

// Source confidence — curated dispersed knowns are nearly tied with
// user-saved so a good Known site beats a slightly-closer saved one.
// Community sites are kept distinct but in scope.
const SOURCE_RANK: Record<CampsiteSource, number> = {
  user_saved: 1.0,
  spot_known: 0.95,
  ridb: 0.95,
  spot_community: 0.8,
  spot_derived: 0.5,
  spot_unknown: 0.3,
};

function sourceScore(candidate: CampsiteCandidate): number {
  return SOURCE_RANK[candidate.source] ?? 0.3;
}

function landTypeScore(candidate: CampsiteCandidate): number {
  if (candidate.source === 'user_saved') return 1;
  const lt = (candidate.land_type ?? '').toLowerCase();
  if (lt === 'public') return 1;
  if (lt === 'mixed') return 0.7;
  if (lt === 'private') return 0.2;
  return 0.6; // unknown — neutral
}

// ---------------------------------------------------------------------------
// Helpers for narrative reasons
// ---------------------------------------------------------------------------

function sourceLabel(source: CampsiteSource): string {
  switch (source) {
    case 'user_saved': return 'Your saved spot';
    case 'spot_known': return 'Known dispersed';
    case 'ridb': return 'Bookable';
    case 'spot_community': return 'Community-submitted';
    case 'spot_derived': return 'OSM-derived';
    case 'spot_unknown': return 'Unverified';
  }
}

// ---------------------------------------------------------------------------
// Main scoring entry point
// ---------------------------------------------------------------------------

export function scoreCampsite(
  candidate: CampsiteCandidate,
  anchor: DayAnchor,
  fit: CampsiteFit,
): CampsiteScore | null {
  if (candidate.distance_miles >= HARD_SPATIAL_MI) return null;

  const lodging = lodgingFitScore(candidate, fit);
  if (lodging.blocked) return null;

  const veh = vehicleScore(candidate, fit);
  if (veh.blocked) return null;

  const spatial = spatialScore(candidate.distance_miles);
  const src = sourceScore(candidate);
  const land = landTypeScore(candidate);

  const score = Math.round(
    100 *
      (spatial * 0.4 +
        lodging.score * 0.2 +
        veh.score * 0.2 +
        src * 0.15 +
        land * 0.05),
  );

  const drive = estimateDrivingFromHaversine(anchor.lat, anchor.lng, candidate.lat, candidate.lng);

  const reasons: string[] = [];
  reasons.push(`${candidate.distance_miles.toFixed(1)} mi from anchor`);
  reasons.push(sourceLabel(candidate.source));
  if (candidate.public_land_manager) reasons.push(candidate.public_land_manager);
  if (candidate.source === 'ridb' && candidate.hasAvailability) reasons.push('Available');

  const warnings: string[] = [];
  if (veh.warning) warnings.push(veh.warning);
  if ((candidate.public_access ?? '').toLowerCase().includes('permit')) {
    warnings.push('Permit required');
  }
  if (candidate.source === 'ridb' && candidate.hasAvailability === false) {
    warnings.push('No availability for these dates');
  }

  return {
    score_0_100: Math.max(0, Math.min(100, score)),
    breakdown: {
      spatial,
      lodging_fit: lodging.score,
      vehicle: veh.score,
      source: src,
      land,
    },
    drive_minutes_one_way: drive.durationMinutes,
    reasons,
    warnings,
  };
}

export function scoreCampsites(
  candidates: CampsiteCandidate[],
  anchor: DayAnchor,
  fit: CampsiteFit,
): ScoredCampsite[] {
  const out: ScoredCampsite[] = [];
  for (const c of candidates) {
    const score = scoreCampsite(c, anchor, fit);
    if (score) out.push({ campsite: c, score });
  }
  out.sort((a, b) => b.score.score_0_100 - a.score.score_0_100);
  return out;
}
