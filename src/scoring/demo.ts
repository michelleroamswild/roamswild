/**
 * Best Hikes Today - Demo
 *
 * Example usage showing how to score hikes for today.
 * Run with: npx tsx src/scoring/demo.ts
 */

import { scoreHikesToday } from "./scoreHikesToday";
import type { Hike, WeatherNow, SunInfo, ScoringContext } from "./types";

// ============================================================================
// SAMPLE DATA
// ============================================================================

const sampleHikes: Hike[] = [
  {
    id: "mission-peak",
    name: "Mission Peak Trail",
    location: { lat: 37.5125, lon: -121.8828 },
    distance_miles: 6.2,
    elevation_gain_ft: 2100,
    access_road_type: "paved",
    trailhead_parking_confidence: "medium",
    popularity: 0.85,
    aspect: "SW",
    viewpoint_score: 0.9,
  },
  {
    id: "muir-woods",
    name: "Muir Woods Loop",
    location: { lat: 37.8970, lon: -122.5811 },
    distance_miles: 3.4,
    elevation_gain_ft: 500,
    access_road_type: "paved",
    trailhead_parking_confidence: "low",
    popularity: 0.95,
    shade_fraction: 0.9,
    water_presence: true,
  },
  {
    id: "mt-tam-east",
    name: "Mt. Tam East Peak",
    location: { lat: 37.9236, lon: -122.5965 },
    distance_miles: 7.8,
    elevation_gain_ft: 2800,
    access_road_type: "paved",
    trailhead_parking_confidence: "high",
    popularity: 0.5,
    aspect: "W",
    viewpoint_score: 0.95,
  },
  {
    id: "tilden-wildcat",
    name: "Tilden to Wildcat Peak",
    location: { lat: 37.9052, lon: -122.2467 },
    distance_miles: 4.5,
    elevation_gain_ft: 900,
    access_road_type: "paved",
    trailhead_parking_confidence: "high",
    popularity: 0.4,
    aspect: "NW",
    viewpoint_score: 0.7,
  },
  {
    id: "sunol-ohlone",
    name: "Sunol Ohlone Wilderness",
    location: { lat: 37.5133, lon: -121.8311 },
    distance_miles: 8.2,
    elevation_gain_ft: 1600,
    access_road_type: "gravel",
    trailhead_parking_confidence: "medium",
    popularity: 0.25,
    water_presence: true,
    aspect: "SE",
    seasonal_closure_risk: "low",
  },
  {
    id: "del-valle",
    name: "Del Valle Regional",
    location: { lat: 37.5614, lon: -121.7108 },
    distance_miles: 5.1,
    elevation_gain_ft: 1100,
    access_road_type: "paved",
    trailhead_parking_confidence: "high",
    popularity: 0.55,
    water_presence: true,
  },
  {
    id: "black-diamond",
    name: "Black Diamond Mines",
    location: { lat: 37.9578, lon: -121.8617 },
    distance_miles: 6.5,
    elevation_gain_ft: 1400,
    access_road_type: "gravel",
    trailhead_parking_confidence: "medium",
    popularity: 0.35,
    aspect: "E",
    viewpoint_score: 0.6,
  },
];

// Simulate weather data - in real use, fetch from weather API
function generateWeatherForHikes(hikes: Hike[]): Record<string, WeatherNow> {
  const weather: Record<string, WeatherNow> = {};

  // Base weather with some variation
  const baseTemp = 72;
  const baseWind = 8;
  const basePrecip = 0.1;
  const baseCloud = 0.35;

  for (const hike of hikes) {
    // Add elevation-based temp variation
    const elevationTempDelta = (hike.elevation_gain_ft / 1000) * -3.5;

    weather[hike.id] = {
      temp_f: Math.round(baseTemp + elevationTempDelta + (Math.random() - 0.5) * 6),
      wind_mph: Math.round(baseWind + Math.random() * 8),
      precip_prob: Math.round((basePrecip + Math.random() * 0.15) * 100) / 100,
      cloud_cover: Math.round((baseCloud + (Math.random() - 0.5) * 0.3) * 100) / 100,
      visibility_miles: 10 + Math.random() * 5,
    };
  }

  return weather;
}

// Generate sun info for today
function generateSunInfo(hikes: Hike[]): Record<string, SunInfo> {
  const sun: Record<string, SunInfo> = {};

  // Typical summer sunset in SF Bay Area
  const sunrise = "2024-06-15T05:48:00-07:00";
  const sunset = "2024-06-15T20:32:00-07:00";

  for (const hike of hikes) {
    sun[hike.id] = {
      sunrise,
      sunset,
      solar_azimuth_deg: 285, // Western sky in evening
      solar_elevation_deg: 18, // Getting low
    };
  }

  return sun;
}

// ============================================================================
// DEMO RUNNER
// ============================================================================

function runDemo() {
  console.log("=".repeat(70));
  console.log("🥾 BEST HIKES TODAY - Scoring Demo");
  console.log("=".repeat(70));
  console.log();

  // Current time: 5:30 PM (good for sunset hikes)
  const nowIso = "2024-06-15T17:30:00-07:00";
  const nowDate = new Date(nowIso);

  console.log(`📅 Current time: ${nowDate.toLocaleString()}`);
  console.log(`📍 User location: San Francisco Bay Area`);
  console.log();

  // Generate weather and sun data
  const weatherByHikeId = generateWeatherForHikes(sampleHikes);
  const sunByHikeId = generateSunInfo(sampleHikes);

  // Scoring context
  const ctx: ScoringContext = {
    user: { lat: 37.7749, lon: -122.4194 }, // SF
    nowIso,
    weatherByHikeId,
    sunByHikeId,
    userPreference: {
      effort: "moderate",
      crowd_tolerance: "neutral",
      vehicle: "awd",
    },
  };

  // Score all hikes
  const results = scoreHikesToday(sampleHikes, ctx);

  // Display top 5
  console.log("🏆 TOP 5 HIKES FOR TODAY:");
  console.log("-".repeat(70));

  results.slice(0, 5).forEach((result, index) => {
    const { hike, score_0_100, breakdown, reasons_short, warnings } = result;
    const weather = weatherByHikeId[hike.id];

    console.log();
    console.log(`#${index + 1} ${hike.name}`);
    console.log(`   Score: ${score_0_100}/100`);
    console.log(`   📏 ${hike.distance_miles} mi | ⛰️  ${hike.elevation_gain_ft.toLocaleString()} ft`);
    console.log(`   🌡️  ${weather.temp_f}°F | 💨 ${weather.wind_mph} mph | ☁️  ${Math.round(weather.cloud_cover * 100)}%`);
    console.log();
    console.log("   Why today:");
    reasons_short.forEach(reason => {
      console.log(`   ✓ ${reason}`);
    });

    if (warnings && warnings.length > 0) {
      console.log();
      console.log("   ⚠️  Warnings:");
      warnings.forEach(warning => {
        console.log(`   • ${warning}`);
      });
    }

    console.log();
    console.log("   Breakdown:");
    console.log(`   Weather: ${(breakdown.weather * 100).toFixed(0)}% | Conditions: ${(breakdown.conditions * 100).toFixed(0)}% | Light: ${(breakdown.light * 100).toFixed(0)}%`);
    console.log(`   Effort: ${(breakdown.effort_match * 100).toFixed(0)}% | Crowd: ${(breakdown.crowd * 100).toFixed(0)}% | Penalties: ${(breakdown.penalties * 100).toFixed(0)}%`);
    console.log("-".repeat(70));
  });

  // Compare with different preferences
  console.log();
  console.log("=".repeat(70));
  console.log("📊 PREFERENCE COMPARISON");
  console.log("=".repeat(70));

  // Easy preference
  const easyCtx: ScoringContext = {
    ...ctx,
    userPreference: { effort: "easy", crowd_tolerance: "avoid", vehicle: "2wd" },
  };
  const easyResults = scoreHikesToday(sampleHikes, easyCtx);

  console.log();
  console.log("🌿 For EASY hikers who AVOID crowds (2WD vehicle):");
  easyResults.slice(0, 3).forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.hike.name} (${r.score_0_100}/100)`);
  });

  // Hard preference
  const hardCtx: ScoringContext = {
    ...ctx,
    userPreference: { effort: "hard", crowd_tolerance: "dont_care", vehicle: "4x4" },
  };
  const hardResults = scoreHikesToday(sampleHikes, hardCtx);

  console.log();
  console.log("🔥 For HARD hikers who DON'T CARE about crowds (4x4 vehicle):");
  hardResults.slice(0, 3).forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.hike.name} (${r.score_0_100}/100)`);
  });

  console.log();
  console.log("=".repeat(70));
  console.log("Demo complete!");
}

// Run if executed directly
runDemo();

export { runDemo };
