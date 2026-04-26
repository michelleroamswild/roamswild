import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  PotentialSpot,
  EstablishedCampground,
  MVUMRoad,
  OSMTrack,
  BLMRoad,
} from './use-dispersed-roads';

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface RegionCacheCheck {
  cached: boolean;
  analysedAt?: Date;
  regionId?: string;
  spotCount?: number;
}

/**
 * Region-level cache for derived dispersed spots.
 *
 * - `checkRegionCache` returns true when a previously-analysed region fully
 *   covers the given map bounds. The caller flips `useDatabase = true` on hit,
 *   and the existing `useDispersedDatabase` hook handles the actual data fetch.
 * - `saveRegionToCache` invokes `save-derived-spots` in the background after a
 *   client-side analysis completes. Failures are logged, never thrown.
 */
export function useRegionCache() {
  const checkRegionCache = useCallback(
    async (bounds: MapBounds): Promise<RegionCacheCheck> => {
      console.log('[RegionCache] 🔍 Checking bbox', {
        south: bounds.south.toFixed(4),
        west: bounds.west.toFixed(4),
        north: bounds.north.toFixed(4),
        east: bounds.east.toFixed(4),
      });
      try {
        const { data, error } = await supabase.rpc('find_covering_region', {
          p_south: bounds.south,
          p_west: bounds.west,
          p_north: bounds.north,
          p_east: bounds.east,
        });

        if (error) {
          console.error('[RegionCache] ❌ RPC error:', error);
          return { cached: false };
        }

        const row = Array.isArray(data) ? data[0] : data;
        if (!row) {
          console.log('[RegionCache] ❌ MISS — no covering region found, will run client analysis');
          return { cached: false };
        }

        const analysedAt = row.analysed_at ? new Date(row.analysed_at) : undefined;
        console.log('[RegionCache] ✅ HIT — region', row.id, 'covers this bbox', {
          analysedAt: analysedAt?.toISOString(),
          spot_count: row.spot_count,
        });

        return {
          cached: true,
          analysedAt,
          regionId: row.id,
          spotCount: row.spot_count,
        };
      } catch (err) {
        console.error('[RegionCache] ❌ checkRegionCache threw:', err);
        return { cached: false };
      }
    },
    []
  );

  const saveRegionToCache = useCallback(
    async (
      spots: PotentialSpot[],
      campgrounds: EstablishedCampground[],
      roads: { mvumRoads: MVUMRoad[]; osmTracks: OSMTrack[]; blmRoads: BLMRoad[] },
      bounds: MapBounds
    ): Promise<void> => {
      const totalRoads = roads.mvumRoads.length + roads.osmTracks.length + roads.blmRoads.length;
      if (spots.length === 0 && campgrounds.length === 0 && totalRoads === 0) {
        console.log('[RegionCache] 💾 Skip save — nothing to persist');
        return;
      }
      console.log(
        '[RegionCache] 💾 Saving',
        spots.length, 'spots +',
        campgrounds.length, 'campgrounds +',
        totalRoads, 'roads...'
      );
      try {
        const { data, error } = await supabase.functions.invoke('save-derived-spots', {
          body: {
            spots,
            campgrounds,
            mvumRoads: roads.mvumRoads,
            osmTracks: roads.osmTracks,
            blmRoads: roads.blmRoads,
            bbox: bounds,
          },
        });
        if (error) {
          console.error('[RegionCache] ❌ save-derived-spots invoke error:', error);
          // Try to pull the response body out of the error for a real message.
          // supabase-js puts the Response in error.context when the fn returns non-2xx.
          const maybeResponse = (error as { context?: Response }).context;
          if (maybeResponse && typeof maybeResponse.json === 'function') {
            try {
              const body = await maybeResponse.json();
              console.error('[RegionCache] ❌ function response body:', body);
            } catch {
              try {
                const text = await maybeResponse.text();
                console.error('[RegionCache] ❌ function response text:', text);
              } catch {
                /* ignore */
              }
            }
          }
          return;
        }
        console.log('[RegionCache] ✅ Save complete', data);
      } catch (err) {
        console.error('[RegionCache] ❌ saveRegionToCache threw:', err);
      }
    },
    []
  );

  return { checkRegionCache, saveRegionToCache };
}
