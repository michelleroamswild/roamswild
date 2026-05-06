/**
 * usePoiSuggestions
 *
 * Fetches POIs near a planned trip day from the local trip-engine database
 * (Supabase `points_of_interest` via the `nearby_points_of_interest` RPC),
 * then scores them with the poiScoring module against the day's spatial,
 * temporal, and user-fit constraints.
 *
 * Returns ranked candidates with score breakdown + reasons for the
 * "Suggest activities" panel on DayDetail.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  scorePois,
  type DayContext,
  type NearbyPoi,
  type ScoredPoi,
  type UserFit,
} from '@/utils/poiScoring';
import type { ActivityType, GeneratedTrip, TripConfig, TripDay } from '@/types/trip';
import { estimateDayTime } from '@/utils/tripValidation';

const DEFAULT_RADIUS_MILES = 30;

// Default day window when start/end times aren't set in the config.
const DEFAULT_WINDOW_MINUTES = 9 * 60; // 9am → 6pm

interface UsePoiSuggestionsArgs {
  trip: GeneratedTrip | null;
  day: TripDay | null;
  /** When false, the hook stays idle (e.g., until the user opens the panel). */
  enabled?: boolean;
  /** Optional radius override. */
  radiusMiles?: number;
}

interface UsePoiSuggestionsResult {
  candidates: ScoredPoi[];
  loading: boolean;
  error: string | null;
  /** Window the scorer used, exposed for UI display. */
  activityWindowMinutes: number | null;
}

function parseHHMM(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function buildRoutePoints(trip: GeneratedTrip, day: TripDay): Array<{ lat: number; lng: number }> {
  const prevDay = trip.days.find((d) => d.day === day.day - 1);
  const prevCamp = prevDay?.stops.find((s) => s.type === 'camp');
  const startCoords = day.day === 1
    ? trip.config.startLocation?.coordinates ?? trip.config.baseLocation?.coordinates
    : prevCamp?.coordinates;

  const points: Array<{ lat: number; lng: number }> = [];
  if (startCoords) points.push(startCoords);
  for (const stop of day.stops) points.push(stop.coordinates);
  return points;
}

function computeActivityWindow(config: TripConfig, day: TripDay): number {
  const start = parseHHMM(config.dailyStartTime);
  const end = parseHHMM(config.returnToCampTime);
  let total: number;
  if (start != null && end != null && end > start) {
    total = end - start;
  } else {
    total = DEFAULT_WINDOW_MINUTES;
  }
  const est = estimateDayTime(day);
  // Subtract minutes already committed to drive + existing hikes.
  const committed = Math.round((est.drivingHours + est.hikingHours) * 60);
  return Math.max(30, total - committed);
}

function buildUserFit(config: TripConfig): UserFit {
  return {
    vehicleType: config.vehicleType,
    hikingDifficulty: config.hikingDifficulty,
    bikingDifficulty: config.bikingDifficulty,
    selectedActivities: (config.activities ?? []) as ActivityType[],
  };
}

export function usePoiSuggestions({
  trip,
  day,
  enabled = true,
  radiusMiles = DEFAULT_RADIUS_MILES,
}: UsePoiSuggestionsArgs): UsePoiSuggestionsResult {
  const [rawPois, setRawPois] = useState<NearbyPoi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Anchor for the RPC call: today's campsite if known, otherwise the first
  // stop. This is also used for distance ordering.
  const anchor = useMemo(() => {
    if (!day) return null;
    const camp = day.stops.find((s) => s.type === 'camp');
    return camp?.coordinates ?? day.stops[0]?.coordinates ?? null;
  }, [day]);

  useEffect(() => {
    if (!enabled || !anchor || !trip || !day) {
      setRawPois([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('nearby_points_of_interest' as never, {
        p_lat: anchor.lat,
        p_lng: anchor.lng,
        p_radius_miles: radiusMiles,
      } as never);
      if (cancelled) return;
      if (rpcError) {
        console.error('[usePoiSuggestions] RPC error', rpcError);
        setError(rpcError.message);
        setRawPois([]);
      } else {
        setRawPois((data ?? []) as unknown as NearbyPoi[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, anchor?.lat, anchor?.lng, radiusMiles, trip?.id, day?.day]);

  const dayContext: DayContext | null = useMemo(() => {
    if (!trip || !day) return null;
    const camp = day.stops.find((s) => s.type === 'camp')?.coordinates ?? null;
    return {
      campsite: camp,
      routePoints: buildRoutePoints(trip, day),
      activityWindowMinutes: computeActivityWindow(trip.config, day),
    };
  }, [trip, day]);

  const candidates = useMemo(() => {
    if (!dayContext || !trip) return [];
    const fit = buildUserFit(trip.config);
    if (fit.selectedActivities.length === 0) return [];
    // Drop POIs already on this day so we don't suggest duplicates.
    const existingIds = new Set(day?.stops.map((s) => s.id) ?? []);
    const fresh = rawPois.filter((p) => !existingIds.has(p.id));
    return scorePois(fresh, dayContext, fit);
  }, [rawPois, dayContext, trip, day]);

  return {
    candidates,
    loading,
    error,
    activityWindowMinutes: dayContext?.activityWindowMinutes ?? null,
  };
}
