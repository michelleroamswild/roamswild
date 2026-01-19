/**
 * Hook for terrain analysis API
 *
 * Calls the Python terrain analysis backend to compute
 * photo-moment locations from DEM and sun position.
 */

import { useState, useCallback } from 'react';
import {
  TerrainAnalysisResult,
  AnalyzeRequest,
} from '@/types/terrainValidation';
import { generateMockAnalysis } from '@/utils/terrainValidationMock';

// API URL from environment or default to localhost
const TERRAIN_API_URL = import.meta.env.VITE_TERRAIN_API_URL || 'http://localhost:8000';

// Use mock data when API is unavailable
const USE_MOCK_FALLBACK = import.meta.env.VITE_TERRAIN_USE_MOCK !== 'false';

export interface UseTerrainAnalysisResult {
  analyze: (request: AnalyzeRequest) => Promise<TerrainAnalysisResult>;
  isLoading: boolean;
  error: string | null;
  result: TerrainAnalysisResult | null;
  usingMock: boolean;
}

export function useTerrainAnalysis(): UseTerrainAnalysisResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TerrainAnalysisResult | null>(null);
  const [usingMock, setUsingMock] = useState(false);

  const analyze = useCallback(async (request: AnalyzeRequest): Promise<TerrainAnalysisResult> => {
    setIsLoading(true);
    setError(null);
    setUsingMock(false);

    try {
      // Try the real API first
      const response = await fetch(`${TERRAIN_API_URL}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lat: request.lat,
          lon: request.lon,
          date: request.date,
          event: request.event,
          radius_km: request.radius_km,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // Transform API response to match our types
      const analysisResult = transformApiResponse(data);
      setResult(analysisResult);
      return analysisResult;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Analysis failed';

      // Fall back to mock data if enabled
      if (USE_MOCK_FALLBACK) {
        console.warn('Terrain API unavailable, using mock data:', errorMessage);
        setUsingMock(true);

        const mockResult = generateMockAnalysis(
          request.lat,
          request.lon,
          request.date,
          request.event
        );
        setResult(mockResult);
        return mockResult;
      }

      setError(errorMessage);
      throw err;

    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    analyze,
    isLoading,
    error,
    result,
    usingMock,
  };
}

/**
 * Transform API response to match TypeScript types.
 *
 * The API returns Python-style snake_case, which should
 * already match our types, but we ensure proper typing here.
 */
function transformApiResponse(data: any): TerrainAnalysisResult {
  return {
    meta: {
      request_id: data.meta.request_id,
      computed_at: data.meta.computed_at,
      dem_source: data.meta.dem_source,
      dem_bounds: data.meta.dem_bounds,
      cell_size_m: data.meta.cell_size_m,
      center_lat: data.meta.center_lat,
      center_lon: data.meta.center_lon,
    },
    sun_track: data.sun_track.map((s: any) => ({
      time_iso: s.time_iso,
      minutes_from_start: s.minutes_from_start,
      azimuth_deg: s.azimuth_deg,
      altitude_deg: s.altitude_deg,
      vector: s.vector,
    })),
    subjects: data.subjects.map((s: any) => ({
      subject_id: s.subject_id,
      centroid: s.centroid,
      polygon: s.polygon,
      properties: {
        elevation_m: s.properties.elevation_m,
        slope_deg: s.properties.slope_deg,
        aspect_deg: s.properties.aspect_deg,
        face_direction_deg: s.properties.face_direction_deg,
        area_m2: s.properties.area_m2,
        normal: s.properties.normal,
      },
      incidence_series: s.incidence_series.map((i: any) => ({
        minutes: i.minutes,
        incidence: i.incidence,
        glow_score: i.glow_score,
      })),
      glow_window: s.glow_window ? {
        start_minutes: s.glow_window.start_minutes,
        end_minutes: s.glow_window.end_minutes,
        peak_minutes: s.glow_window.peak_minutes,
        duration_minutes: s.glow_window.duration_minutes,
        peak_incidence: s.glow_window.peak_incidence,
        peak_glow_score: s.glow_window.peak_glow_score,
      } : null,
      shadow_check: {
        checked_at_minutes: s.shadow_check.checked_at_minutes,
        sun_azimuth_deg: s.shadow_check.sun_azimuth_deg,
        sun_altitude_deg: s.shadow_check.sun_altitude_deg,
        samples: s.shadow_check.samples.map((sample: any) => ({
          distance_m: sample.distance_m,
          ray_z: sample.ray_z,
          terrain_z: sample.terrain_z,
          blocked: sample.blocked,
        })),
        sun_visible: s.shadow_check.sun_visible,
      },
      validation: {
        normal_unit_length: s.validation.normal_unit_length,
        aspect_normal_match_deg: s.validation.aspect_normal_match_deg,
        glow_in_range: s.validation.glow_in_range,
        sun_visible_at_peak: s.validation.sun_visible_at_peak,
      },
    })),
    standing_locations: data.standing_locations.map((sl: any) => ({
      standing_id: sl.standing_id,
      subject_id: sl.subject_id,
      location: sl.location,
      properties: {
        elevation_m: sl.properties.elevation_m,
        slope_deg: sl.properties.slope_deg,
        distance_to_subject_m: sl.properties.distance_to_subject_m,
        camera_bearing_deg: sl.properties.camera_bearing_deg,
        elevation_diff_m: sl.properties.elevation_diff_m,
      },
      line_of_sight: {
        clear: sl.line_of_sight.clear,
        eye_height_m: sl.line_of_sight.eye_height_m,
        target_height_m: sl.line_of_sight.target_height_m,
        samples: sl.line_of_sight.samples.map((sample: any) => ({
          t: sample.t,
          ray_z: sample.ray_z,
          terrain_z: sample.terrain_z,
          blocked: sample.blocked,
        })),
      },
      candidate_search: {
        candidates_checked: sl.candidate_search.candidates_checked,
        rejected: sl.candidate_search.rejected.map((r: any) => ({
          distance_m: r.distance_m,
          lat: r.lat,
          lon: r.lon,
          reason: r.reason,
          slope_deg: r.slope_deg,
        })),
        selected_at_distance_m: sl.candidate_search.selected_at_distance_m,
      },
      nav_link: sl.nav_link,
    })),
    debug_layers: data.debug_layers || {},
  };
}

/**
 * Check if the terrain API is available
 */
export async function checkTerrainApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${TERRAIN_API_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
