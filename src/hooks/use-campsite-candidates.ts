/**
 * useCampsiteCandidates
 *
 * Fetches campsite candidates from the public spots database and scores
 * them against a day's anchor + trip config.
 *
 *   - Public spots from the `nearby_spots` RPC, filtered by `kind` derived
 *     from `config.lodgingPreference`
 *
 * User's saved sites (`campsites` table) are intentionally excluded for
 * now — they were polluted with scratch "Dropped pin" rows and dominated
 * the rankings. Re-introduce once we have a quality gate.
 *
 * Callers (e.g. the swap modal) can pass `extraCandidates` to layer in
 * RIDB-bookable rows when `lodgingPreference === 'campground'`.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  scoreCampsites,
  type CampsiteCandidate,
  type CampsiteSource,
  type ScoredCampsite,
} from '@/utils/campsiteScoring';
import type { LodgingType, TripConfig, VehicleType } from '@/types/trip';

const DEFAULT_RADIUS_MILES = 50;

interface UseCampsiteCandidatesArgs {
  anchor: { lat: number; lng: number } | null;
  config: TripConfig;
  enabled?: boolean;
  radiusMiles?: number;
  /** RIDB-bookable rows, normalized to CampsiteCandidate. Caller decides
   *  whether to fetch them (today: only when lodging = campground). */
  extraCandidates?: CampsiteCandidate[];
  /** Optional id to exclude from the result (e.g. the current campsite). */
  excludeId?: string;
}

interface UseCampsiteCandidatesResult {
  candidates: ScoredCampsite[];
  loading: boolean;
  error: string | null;
}

const KIND_FOR_LODGING: Record<LodgingType, string[] | null> = {
  dispersed: ['dispersed_camping'],
  campground: ['established_campground'],
  cabin: null,
  hotel: null,
  mixed: null,
  other: null,
};

function spotSubSource(row: { source: string | null; sub_kind: string | null }): CampsiteSource {
  if (row.sub_kind === 'known') return 'spot_known';
  if (row.source === 'community') return 'spot_community';
  if (row.sub_kind === 'derived' || row.source === 'osm' || row.source === 'mvum') return 'spot_derived';
  if (row.source === 'ridb') return 'ridb';
  return 'spot_unknown';
}


interface SpotRpcRow {
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

export function useCampsiteCandidates({
  anchor,
  config,
  enabled = true,
  radiusMiles = DEFAULT_RADIUS_MILES,
  extraCandidates,
  excludeId,
}: UseCampsiteCandidatesArgs): UseCampsiteCandidatesResult {
  const [spotRows, setSpotRows] = useState<SpotRpcRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lodging = config.lodgingPreference;
  const kindsKey = useMemo(() => {
    if (!lodging) return null;
    const ks = KIND_FOR_LODGING[lodging];
    return ks === null ? null : ks;
  }, [lodging]);

  useEffect(() => {
    if (!enabled || !anchor) {
      setSpotRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const spotsRes = await supabase.rpc('nearby_spots' as never, {
        p_lat: anchor.lat,
        p_lng: anchor.lng,
        p_radius_miles: radiusMiles,
        p_kinds: kindsKey,
      } as never);

      if (cancelled) return;

      if (spotsRes.error) {
        console.error('[useCampsiteCandidates] spots RPC', spotsRes.error);
        setError(spotsRes.error.message);
      }

      setSpotRows(((spotsRes.data ?? []) as unknown as SpotRpcRow[]));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, anchor?.lat, anchor?.lng, radiusMiles, kindsKey?.join(','), config.lodgingPreference]);

  const candidates = useMemo<ScoredCampsite[]>(() => {
    if (!anchor) return [];

    // For dispersed lodging, restrict to `dispersed_camping` with sub_kind
    // strictly Known or Community, and drop rows the pipeline has already
    // flagged as an established campground via `extra.derivation_reasons`.
    const filteredRows =
      lodging === 'dispersed'
        ? spotRows.filter((r) => {
            if (r.kind !== 'dispersed_camping') return false;
            if (r.sub_kind !== 'known' && r.sub_kind !== 'community') return false;
            const reasons = (r.extra as any)?.derivation_reasons;
            if (
              Array.isArray(reasons) &&
              reasons.some((x: any) => /established\s+campground/i.test(String(x)))
            ) {
              return false;
            }
            return true;
          })
        : spotRows;

    const fromSpots: CampsiteCandidate[] = filteredRows.map((r) => ({
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

    const merged = [...fromSpots, ...(extraCandidates ?? [])];
    const filtered = excludeId ? merged.filter((c) => c.id !== excludeId) : merged;

    const fit = {
      vehicleType: config.vehicleType as VehicleType | undefined,
      lodgingPreference: config.lodgingPreference,
    };
    return scoreCampsites(filtered, anchor, fit);
  }, [anchor, spotRows, extraCandidates, excludeId, config.vehicleType, config.lodgingPreference]);

  return { candidates, loading, error };
}
