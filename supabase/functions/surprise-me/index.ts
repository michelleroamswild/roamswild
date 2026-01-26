import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ============================================
// Types
// ============================================

type BiomeType = 'desert' | 'alpine' | 'forest' | 'coastal' | 'grassland';
type RoadSurfaceType = 'paved' | 'gravel' | 'dirt' | '4wd_only' | 'no_vehicle_access';
type VehicleType = 'sedan' | 'suv' | 'truck' | '4wd' | 'rv';

interface SurpriseMeRequest {
  userId?: string;
  sessionId?: string;
  userLat: number;
  userLng: number;
  maxDistanceMiles: number;
  minDistanceMiles?: number;
  preferredDistanceMiles?: number;
  userVehicle?: VehicleType;
  requiresCellService?: boolean;
  maxElevationFt?: number;
  excludeBiomes?: BiomeType[];
  skipDiversityBoost?: boolean;
}

interface RegionWithMetrics {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  bbox_north: number;
  bbox_south: number;
  bbox_east: number;
  bbox_west: number;
  primary_biome: BiomeType | null;
  secondary_biomes: BiomeType[] | null;
  area_sq_miles: number | null;
  public_land_pct: number | null;
  public_land_score: number | null;
  trail_count: number;
  trail_density_score: number | null;
  campsite_count: number;
  dispersed_camping_allowed: boolean;
  campsite_density_score: number | null;
  popularity_score: number | null;
  remoteness_score: number | null;
  elevation_min_ft: number | null;
  elevation_avg_ft: number | null;
  elevation_max_ft: number | null;
  seasonal_access_score: number | null;
  best_road_surface: RoadSurfaceType | null;
  has_paved_access: boolean;
  cell_coverage_pct: number | null;
  has_cell_coverage: boolean;
  current_snow_cover_pct: number | null;
  quality_score: number | null;
  distance_miles?: number;
}

interface ScoredCandidate {
  region: RegionWithMetrics;
  score: number;
  breakdown: {
    base: number;
    distanceFactor: number;
    diversityMult: number;
    components: Record<string, number>;
  };
}

// ============================================
// Constants
// ============================================

const SCORE_WEIGHTS = {
  publicLand: 0.20,
  trailDensity: 0.20,
  campsiteDensity: 0.15,
  popularity: 0.20,
  remoteness: 0.10,
  seasonalAccess: 0.15,
};

const HARD_FILTERS = {
  minPublicLandPct: 25,
  minTrailCount: 3,
  minSeasonalAccessScore: 40,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// Utility Functions
// ============================================

function gaussian(x: number, mu: number, sigma: number): number {
  return Math.exp(-Math.pow(x - mu, 2) / (2 * Math.pow(sigma, 2)));
}

function calculateDistanceFactor(distanceMiles: number, maxDistance: number, preferredDistance?: number): number {
  const preferred = preferredDistance ?? maxDistance * 0.6;
  const sigma = maxDistance * 0.3;
  return Math.max(0.3, gaussian(distanceMiles, preferred, sigma));
}

function getDiversityMultiplier(biome: BiomeType | null, recentBiomes: BiomeType[]): number {
  if (!biome || recentBiomes.length === 0) return 1.15;
  const count = recentBiomes.filter((b) => b === biome).length;
  if (count === 0) return 1.15;
  if (count === 1) return 1.05;
  if (count === 2) return 1.00;
  return 0.85;
}

function getRecommendedVehicle(surface: RoadSurfaceType): string {
  const vehicles: Record<RoadSurfaceType, string> = {
    paved: 'Any vehicle',
    gravel: 'SUV or truck recommended',
    dirt: 'High clearance vehicle recommended',
    '4wd_only': '4WD required',
    no_vehicle_access: 'No vehicle access',
  };
  return vehicles[surface] || 'Unknown';
}

// ============================================
// Scoring
// ============================================

function scoreRegion(region: RegionWithMetrics, request: SurpriseMeRequest, recentBiomes: BiomeType[]): ScoredCandidate {
  const components = {
    publicLand: region.public_land_score ?? 0,
    trailDensity: region.trail_density_score ?? 0,
    campsiteDensity: region.campsite_density_score ?? 0,
    popularity: region.popularity_score ?? 50,
    remoteness: region.remoteness_score ?? 50,
    seasonalAccess: region.seasonal_access_score ?? 50,
  };

  const baseScore =
    SCORE_WEIGHTS.publicLand * components.publicLand +
    SCORE_WEIGHTS.trailDensity * components.trailDensity +
    SCORE_WEIGHTS.campsiteDensity * components.campsiteDensity +
    SCORE_WEIGHTS.popularity * components.popularity +
    SCORE_WEIGHTS.remoteness * components.remoteness +
    SCORE_WEIGHTS.seasonalAccess * components.seasonalAccess;

  const distanceFactor = calculateDistanceFactor(
    region.distance_miles ?? 100,
    request.maxDistanceMiles,
    request.preferredDistanceMiles
  );

  const diversityMult = request.skipDiversityBoost ? 1.0 : getDiversityMultiplier(region.primary_biome, recentBiomes);
  const finalScore = baseScore * distanceFactor * diversityMult;

  return {
    region,
    score: Math.round(finalScore * 10) / 10,
    breakdown: {
      base: Math.round(baseScore * 10) / 10,
      distanceFactor: Math.round(distanceFactor * 100) / 100,
      diversityMult: Math.round(diversityMult * 100) / 100,
      components,
    },
  };
}

function weightedRandomSelect(candidates: ScoredCandidate[]): ScoredCandidate {
  if (candidates.length === 0) throw new Error('No candidates');
  if (candidates.length === 1) return candidates[0];

  const weights = candidates.map((c) => Math.pow(c.score, 2));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const target = Math.random() * totalWeight;

  let cumulative = 0;
  for (let i = 0; i < candidates.length; i++) {
    cumulative += weights[i];
    if (cumulative >= target) return candidates[i];
  }

  return candidates[candidates.length - 1];
}

function generateExplanation(candidate: ScoredCandidate): string {
  const { region, breakdown } = candidate;
  const reasons: string[] = [];

  const distance = region.distance_miles ?? 100;
  if (distance < 100) reasons.push('close enough for a weekend trip');
  else if (distance < 200) reasons.push("a solid day's drive for a longer adventure");
  else reasons.push('worth the journey for something special');

  if (breakdown.base > 80) reasons.push('excellent mix of trails and camping');
  else if (breakdown.base > 60) reasons.push('good balance of activities and solitude');

  if (breakdown.components.popularity > 85) reasons.push('popular enough to be well-documented but not overrun');
  else if (breakdown.components.popularity < 50) reasons.push('off the beaten path with few crowds');

  if (breakdown.diversityMult > 1.1) reasons.push('a change of scenery from your recent trips');

  if (reasons.length === 0) return `We picked ${region.name} as a great spot to explore.`;
  if (reasons.length === 1) return `We picked ${region.name} because it's ${reasons[0]}.`;

  const lastReason = reasons.pop();
  return `We picked ${region.name} because it's ${reasons.join(', ')}, and ${lastReason}.`;
}

// ============================================
// Main Handler
// ============================================

serve(async (req) => {
  console.log('=== SURPRISE-ME FUNCTION INVOKED ===');
  console.log('Method:', req.method);
  console.log('Headers:', Object.fromEntries(req.headers.entries()));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const request: SurpriseMeRequest = await req.json();
    console.log('Incoming request:', JSON.stringify(request));

    if (!request.userLat || !request.userLng) {
      return new Response(
        JSON.stringify({ success: false, error: 'LOCATION_REQUIRED', message: 'User location is required' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get recent biomes for diversity
    let recentBiomes: BiomeType[] = [];
    if (request.userId) {
      const { data: biomeData } = await supabase
        .from('surprise_history')
        .select('region_biome')
        .eq('user_id', request.userId)
        .not('region_biome', 'is', null)
        .order('recommended_at', { ascending: false })
        .limit(5);
      recentBiomes = (biomeData || []).map((r: { region_biome: BiomeType }) => r.region_biome);
    }

    // Get regions within distance
    const minDistance = request.minDistanceMiles ?? 0;
    const maxDistance = request.maxDistanceMiles ?? 200;

    const { data: distanceData, error: distanceError } = await supabase.rpc(
      'get_regions_within_distance',
      { user_lat: request.userLat, user_lng: request.userLng, max_distance_miles: maxDistance, min_distance_miles: minDistance }
    );

    if (distanceError) throw new Error('Failed to query regions: ' + distanceError.message);

    if (!distanceData || distanceData.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'NO_REGIONS_AVAILABLE', message: 'No regions found within your search distance', suggestion: 'Try increasing your maximum distance' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get full region data
    const regionIds = distanceData.map((d: { region_id: string }) => d.region_id);
    const distanceMap = new Map(distanceData.map((d: { region_id: string; distance_miles: number }) => [d.region_id, d.distance_miles]));

    const { data: regions, error: regionsError } = await supabase
      .from('regions_with_metrics')
      .select('*')
      .in('id', regionIds);

    if (regionsError) throw new Error('Failed to fetch regions: ' + regionsError.message);

    // Apply filters and add distance
    let candidates: RegionWithMetrics[] = (regions || [])
      .map((r: RegionWithMetrics) => ({ ...r, distance_miles: distanceMap.get(r.id) ?? 100 }))
      .filter((region: RegionWithMetrics) => {
        if ((region.public_land_pct ?? 0) < HARD_FILTERS.minPublicLandPct) return false;
        if (region.trail_count < HARD_FILTERS.minTrailCount) return false;
        if (region.campsite_count < 1 && !region.dispersed_camping_allowed) return false;
        if ((region.seasonal_access_score ?? 0) < HARD_FILTERS.minSeasonalAccessScore) return false;
        if (request.excludeBiomes && region.primary_biome && request.excludeBiomes.includes(region.primary_biome)) return false;
        if (request.requiresCellService && !region.has_cell_coverage) return false;
        return true;
      });

    if (candidates.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'NO_REGIONS_AVAILABLE', message: 'No regions match your criteria', suggestion: 'Try relaxing your filters' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Score and select
    const scoredCandidates = candidates.map((region) => scoreRegion(region, request, recentBiomes));
    const selected = weightedRandomSelect(scoredCandidates);

    // Generate cautions
    const cautions: string[] = [];
    const roadSurface = selected.region.best_road_surface ?? 'gravel';
    if (roadSurface !== 'paved') cautions.push(`Access via ${roadSurface} roads`);
    if ((selected.region.cell_coverage_pct ?? 0) < 30) cautions.push('Limited cell service - download offline maps');
    if ((selected.region.elevation_max_ft ?? 0) > 10000) cautions.push('High elevation area - be prepared for altitude');

    // Record history (don't let this fail the request)
    try {
      await supabase.from('surprise_history').insert({
        user_id: request.userId || null,
        session_id: request.sessionId || null,
        region_id: selected.region.id,
        region_name: selected.region.name,
        region_biome: selected.region.primary_biome,
        request_params: request,
        user_lat: request.userLat,
        user_lng: request.userLng,
        distance_miles: selected.region.distance_miles,
        score_at_selection: selected.score,
        score_breakdown: selected.breakdown,
        candidates_count: scoredCandidates.length,
      });
    } catch (historyError) {
      console.error('Failed to record history:', historyError);
    }

    // Build response
    const centerLat = (selected.region.bbox_north + selected.region.bbox_south) / 2;
    const centerLng = (selected.region.bbox_east + selected.region.bbox_west) / 2;

    return new Response(
      JSON.stringify({
        success: true,
        region: {
          id: selected.region.id,
          name: selected.region.name,
          slug: selected.region.slug,
          tagline: selected.region.tagline,
          description: selected.region.description,
          bounds: { north: selected.region.bbox_north, south: selected.region.bbox_south, east: selected.region.bbox_east, west: selected.region.bbox_west },
          center: { lat: centerLat, lng: centerLng },
          primaryBiome: selected.region.primary_biome,
          distanceMiles: Math.round(selected.region.distance_miles ?? 0),
          driveTimeHours: Math.round((selected.region.distance_miles ?? 0) / 50 * 10) / 10,
          areaSqMiles: selected.region.area_sq_miles,
        },
        scores: { overall: selected.score, breakdown: selected.breakdown },
        access: { roadType: roadSurface, recommendedVehicle: getRecommendedVehicle(roadSurface), cautions: [] },
        cautions,
        explanation: generateExplanation(selected),
        meta: { candidatesEvaluated: scoredCandidates.length, algorithmVersion: '1.0' },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('Surprise Me error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'SERVICE_ERROR', message: error.message || 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
