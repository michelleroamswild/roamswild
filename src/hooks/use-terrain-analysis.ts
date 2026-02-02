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
          debug: request.debug ?? false,
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
 * The API returns Python-style snake_case, which already matches
 * our TypeScript types. We pass through the data directly to avoid
 * losing fields when new ones are added to the API.
 */
function transformApiResponse(data: any): TerrainAnalysisResult {
  // Pass through most data directly - the API response already matches our types
  return {
    meta: data.meta,
    sun_track: data.sun_track,
    subjects: data.subjects.map((s: any) => ({
      ...s,
      // Ensure candidate_search is passed through (may be on subject or standing)
      candidate_search: s.candidate_search,
    })),
    standing_locations: data.standing_locations,
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
