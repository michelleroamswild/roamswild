import { useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  SurpriseMeRequest,
  SurpriseMeResponse,
  SurpriseMeSuccessResponse,
  SurpriseMeErrorResponse,
  BiomeType,
  VehicleType,
  ScenicAnchor,
  ScenicAnchorHighlight,
  ScenicAnchorMeta,
  isSurpriseMeSuccess,
} from '@/types/surpriseMe';
import { getScenicDriveAnchor, type RegionInput } from '@/utils/overpass';

interface UseSurpriseMeOptions {
  maxDistanceMiles?: number;
  minDistanceMiles?: number;
  preferredDistanceMiles?: number;
  userVehicle?: VehicleType;
  requiresCellService?: boolean;
  maxElevationFt?: number;
  excludeBiomes?: BiomeType[];
}

/**
 * Enrich a surprise response with scenic anchor data
 * Fetches road segments and highlights from Overpass API
 */
async function enrichWithAnchor(
  response: SurpriseMeSuccessResponse
): Promise<SurpriseMeSuccessResponse> {
  try {
    const regionInput: RegionInput = {
      id: response.region.id,
      bbox: {
        north: response.region.bounds.north,
        south: response.region.bounds.south,
        east: response.region.bounds.east,
        west: response.region.bounds.west,
      },
      center: {
        lat: response.region.center.lat,
        lng: response.region.center.lng,
      },
      name: response.region.name,
    };

    const anchorResult = await getScenicDriveAnchor(regionInput, {
      skipHighlights: false,
    });

    if (!anchorResult.success || !anchorResult.anchor) {
      // Return response without anchor - don't fail the whole request
      console.warn('Failed to find scenic anchor:', anchorResult.error);
      return response;
    }

    // Transform anchor to the response format
    const anchor: ScenicAnchor = {
      road: {
        name: anchorResult.anchor.road.name,
        ref: anchorResult.anchor.road.ref,
        surface: anchorResult.anchor.road.surface,
        highway: anchorResult.anchor.road.highway,
      },
      start: anchorResult.anchor.start,
      end: anchorResult.anchor.end,
      center: anchorResult.anchor.center,
      lengthMiles: anchorResult.anchor.lengthMiles,
      score: anchorResult.anchor.score.total,
    };

    // Transform highlights
    const anchorHighlights: ScenicAnchorHighlight[] = (anchorResult.highlights || []).map(h => ({
      type: h.type,
      name: h.name,
      lat: h.lat,
      lon: h.lon,
      distanceMiles: h.distanceMiles,
      isNamed: h.isNamed,
    }));

    const anchorMeta: ScenicAnchorMeta = {
      regionId: anchorResult.meta.regionId,
      candidatesEvaluated: anchorResult.meta.candidatesEvaluated,
      strategy: anchorResult.meta.strategy,
      wasFallback: anchorResult.meta.wasFallback,
      cacheHit: anchorResult.meta.cacheHit,
      source: anchorResult.source,
    };

    return {
      ...response,
      anchor,
      anchorHighlights,
      anchorMeta,
    };
  } catch (err) {
    // Log but don't fail - anchor is enhancement, not critical
    console.error('Error enriching with anchor:', err);
    return response;
  }
}

interface UseSurpriseMeReturn {
  loading: boolean;
  error: string | null;
  result: SurpriseMeSuccessResponse | null;
  getSurprise: (lat: number, lng: number) => Promise<SurpriseMeResponse>;
  clearResult: () => void;
  recordClick: () => Promise<void>;
  recordSaveToTrip: () => Promise<void>;
}

/**
 * Hook for the "Surprise Me" feature
 * Generates random region recommendations based on user preferences
 */
export function useSurpriseMe(options: UseSurpriseMeOptions = {}): UseSurpriseMeReturn {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SurpriseMeSuccessResponse | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);

  const getSurprise = useCallback(
    async (lat: number, lng: number, overrides?: { maxDistanceMiles?: number }): Promise<SurpriseMeResponse> => {
      setLoading(true);
      setError(null);
      setResult(null);
      setHistoryId(null);

      try {
        // Build request - only include defined values
        const request: SurpriseMeRequest = {
          userLat: lat,
          userLng: lng,
          maxDistanceMiles: overrides?.maxDistanceMiles ?? options.maxDistanceMiles ?? 500,
          minDistanceMiles: options.minDistanceMiles ?? 0,
        };

        // Only add optional fields if they have values
        if (user?.id) request.userId = user.id;
        if (!user) request.sessionId = getSessionId();
        if (options.preferredDistanceMiles) request.preferredDistanceMiles = options.preferredDistanceMiles;
        if (options.userVehicle) request.userVehicle = options.userVehicle;
        if (options.requiresCellService) request.requiresCellService = options.requiresCellService;
        if (options.maxElevationFt) request.maxElevationFt = options.maxElevationFt;
        if (options.excludeBiomes?.length) request.excludeBiomes = options.excludeBiomes;

        console.log('Sending surprise request:', request);

        // Get the current session for auth
        const { data: sessionData } = await supabase.auth.getSession();
        console.log('Auth session:', sessionData?.session ? 'present' : 'none');

        // Call edge function
        const { data, error: fnError } = await supabase.functions.invoke('surprise-me', {
          body: request,
        });

        console.log('Function response:', { data, error: fnError });

        if (fnError) {
          // Try to extract error details from the response
          console.error('Surprise Me function error:', fnError);
          // Try to get the response body for more details
          if (fnError.context?.body) {
            const body = await fnError.context.body.text?.() || fnError.context.body;
            console.error('Error response body:', body);
          }
          const errorMessage = fnError.message || 'Failed to get surprise recommendation';
          throw new Error(errorMessage);
        }

        if (!data) {
          throw new Error('No data returned from function');
        }

        const response = data as SurpriseMeResponse;

        if (isSurpriseMeSuccess(response)) {
          // Show result immediately without anchor
          setResult(response);
          // Store history ID for tracking clicks
          if (response.meta && 'historyId' in response.meta) {
            setHistoryId((response.meta as { historyId?: string }).historyId ?? null);
          }

          // Enrich with scenic anchor in the background (progressive loading)
          enrichWithAnchor(response).then((enrichedResponse) => {
            console.log('[SurpriseMe] Anchor enrichment complete:', enrichedResponse.anchor ? 'found' : 'none', enrichedResponse.anchorHighlights?.length || 0, 'highlights');
            setResult(enrichedResponse);
          }).catch((err) => {
            console.error('[SurpriseMe] Anchor enrichment failed:', err);
          });

          return response;
        } else {
          setError(response.message);
        }

        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred';
        setError(message);
        return {
          success: false,
          error: 'SERVICE_ERROR',
          message,
        };
      } finally {
        setLoading(false);
      }
    },
    [user, options]
  );

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
    setHistoryId(null);
  }, []);

  const recordClick = useCallback(async () => {
    if (!historyId) return;

    try {
      await supabase
        .from('surprise_history')
        .update({
          clicked_through: true,
          clicked_at: new Date().toISOString(),
        })
        .eq('id', historyId);
    } catch (err) {
      console.error('Failed to record click:', err);
    }
  }, [historyId]);

  const recordSaveToTrip = useCallback(async () => {
    if (!historyId) return;

    try {
      await supabase
        .from('surprise_history')
        .update({ saved_to_trips: true })
        .eq('id', historyId);
    } catch (err) {
      console.error('Failed to record save to trip:', err);
    }
  }, [historyId]);

  return {
    loading,
    error,
    result,
    getSurprise,
    clearResult,
    recordClick,
    recordSaveToTrip,
  };
}

// ============================================
// Session ID Management (for anonymous users)
// ============================================

const SESSION_ID_KEY = 'surprise_me_session_id';

function getSessionId(): string {
  let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// ============================================
// Convenience Hooks
// ============================================

/**
 * Hook to get user's recent surprise biomes for diversity display
 */
export function useRecentSurpriseBiomes(limit: number = 5) {
  const { user } = useAuth();
  const [biomes, setBiomes] = useState<BiomeType[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBiomes = useCallback(async () => {
    if (!user) {
      setBiomes([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('surprise_history')
        .select('region_biome')
        .eq('user_id', user.id)
        .not('region_biome', 'is', null)
        .order('recommended_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      setBiomes((data || []).map((row) => row.region_biome as BiomeType));
    } catch (err) {
      console.error('Failed to fetch recent biomes:', err);
      setBiomes([]);
    } finally {
      setLoading(false);
    }
  }, [user, limit]);

  return { biomes, loading, refresh: fetchBiomes };
}

/**
 * Hook to get user's surprise history
 */
export function useSurpriseHistory(limit: number = 10) {
  const { user } = useAuth();
  const [history, setHistory] = useState<
    Array<{
      id: string;
      regionName: string;
      regionBiome: BiomeType | null;
      distanceMiles: number | null;
      recommendedAt: string;
      clickedThrough: boolean;
      savedToTrips: boolean;
    }>
  >([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!user) {
      setHistory([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('surprise_history')
        .select('id, region_name, region_biome, distance_miles, recommended_at, clicked_through, saved_to_trips')
        .eq('user_id', user.id)
        .order('recommended_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      setHistory(
        (data || []).map((row) => ({
          id: row.id,
          regionName: row.region_name,
          regionBiome: row.region_biome as BiomeType | null,
          distanceMiles: row.distance_miles,
          recommendedAt: row.recommended_at,
          clickedThrough: row.clicked_through,
          savedToTrips: row.saved_to_trips,
        }))
      );
    } catch (err) {
      console.error('Failed to fetch surprise history:', err);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [user, limit]);

  return { history, loading, refresh: fetchHistory };
}
