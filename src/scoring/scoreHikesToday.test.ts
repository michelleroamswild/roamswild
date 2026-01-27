/**
 * Best Hikes Today - Unit Tests
 *
 * Tests for scoring functions covering edge cases:
 * - Danger alerts
 * - 2WD vs high-clearance roads
 * - Near-sunset boosts
 * - Crowd tolerance
 */

import { describe, it, expect } from "vitest";
import {
  scoreWeather,
  scoreConditions,
  scoreLight,
  scoreEffortMatch,
  scoreCrowd,
  calculatePenalties,
  scoreHikesToday,
} from "./scoreHikesToday";
import {
  clamp01,
  lerp,
  inverseLerp,
  gaussianLike,
  tempComfortScore,
  windComfortScore,
  precipProbScore,
  hoursUntil,
  isWithinHoursOf,
} from "./helpers";
import { Hike, WeatherNow, SunInfo, ScoringContext } from "./types";

// ============================================================================
// HELPER FUNCTION TESTS
// ============================================================================

describe("Helper Functions", () => {
  describe("clamp01", () => {
    it("clamps values below 0 to 0", () => {
      expect(clamp01(-0.5)).toBe(0);
      expect(clamp01(-100)).toBe(0);
    });

    it("clamps values above 1 to 1", () => {
      expect(clamp01(1.5)).toBe(1);
      expect(clamp01(100)).toBe(1);
    });

    it("passes through values in range", () => {
      expect(clamp01(0)).toBe(0);
      expect(clamp01(0.5)).toBe(0.5);
      expect(clamp01(1)).toBe(1);
    });
  });

  describe("lerp", () => {
    it("returns a when t=0", () => {
      expect(lerp(10, 20, 0)).toBe(10);
    });

    it("returns b when t=1", () => {
      expect(lerp(10, 20, 1)).toBe(20);
    });

    it("interpolates correctly", () => {
      expect(lerp(0, 100, 0.5)).toBe(50);
      expect(lerp(0, 100, 0.25)).toBe(25);
    });
  });

  describe("inverseLerp", () => {
    it("returns 0 when x equals a", () => {
      expect(inverseLerp(10, 20, 10)).toBe(0);
    });

    it("returns 1 when x equals b", () => {
      expect(inverseLerp(10, 20, 20)).toBe(1);
    });

    it("clamps values outside range", () => {
      expect(inverseLerp(10, 20, 5)).toBe(0);
      expect(inverseLerp(10, 20, 25)).toBe(1);
    });
  });

  describe("gaussianLike", () => {
    it("returns 1.0 at mean", () => {
      expect(gaussianLike(50, 50, 10)).toBe(1);
    });

    it("returns lower values away from mean", () => {
      const atMean = gaussianLike(50, 50, 10);
      const oneSigma = gaussianLike(60, 50, 10);
      const twoSigma = gaussianLike(70, 50, 10);
      expect(atMean).toBeGreaterThan(oneSigma);
      expect(oneSigma).toBeGreaterThan(twoSigma);
    });
  });

  describe("tempComfortScore", () => {
    it("returns 1.0 for optimal temps (55-75F)", () => {
      expect(tempComfortScore(65)).toBe(1.0);
      expect(tempComfortScore(55)).toBe(1.0);
      expect(tempComfortScore(75)).toBe(1.0);
    });

    it("reduces score for cold temps", () => {
      const optimal = tempComfortScore(65);
      const cool = tempComfortScore(50);
      const cold = tempComfortScore(35);
      expect(optimal).toBeGreaterThan(cool);
      expect(cool).toBeGreaterThan(cold);
    });

    it("reduces score for hot temps", () => {
      const optimal = tempComfortScore(70);
      const warm = tempComfortScore(85);
      const hot = tempComfortScore(100);
      expect(optimal).toBeGreaterThan(warm);
      expect(warm).toBeGreaterThan(hot);
    });
  });

  describe("windComfortScore", () => {
    it("returns 1.0 for calm winds", () => {
      expect(windComfortScore(0)).toBe(1.0);
      expect(windComfortScore(5)).toBe(1.0);
    });

    it("penalizes high winds progressively", () => {
      const calm = windComfortScore(5);
      const moderate = windComfortScore(15);
      const strong = windComfortScore(25);
      const extreme = windComfortScore(40);

      expect(calm).toBeGreaterThan(moderate);
      expect(moderate).toBeGreaterThan(strong);
      expect(strong).toBeGreaterThan(extreme);
    });

    it("heavily penalizes winds > 30 mph", () => {
      expect(windComfortScore(35)).toBeLessThan(0.2);
    });
  });

  describe("precipProbScore", () => {
    it("returns high score for low precip probability", () => {
      expect(precipProbScore(0)).toBe(1.0);
      expect(precipProbScore(0.1)).toBe(1.0);
    });

    it("penalizes high precip probability", () => {
      expect(precipProbScore(0.7)).toBeLessThan(0.4);
      expect(precipProbScore(0.9)).toBeLessThan(0.2);
    });
  });

  describe("hoursUntil", () => {
    it("calculates positive hours for future time", () => {
      const now = "2024-06-15T14:00:00Z";
      const future = "2024-06-15T16:30:00Z";
      expect(hoursUntil(now, future)).toBeCloseTo(2.5);
    });

    it("calculates negative hours for past time", () => {
      const now = "2024-06-15T14:00:00Z";
      const past = "2024-06-15T12:00:00Z";
      expect(hoursUntil(now, past)).toBeCloseTo(-2);
    });
  });

  describe("isWithinHoursOf", () => {
    it("returns true when within range", () => {
      const now = "2024-06-15T18:00:00Z";
      const sunset = "2024-06-15T20:00:00Z";
      expect(isWithinHoursOf(now, sunset, 2.5)).toBe(true);
    });

    it("returns false when outside range", () => {
      const now = "2024-06-15T14:00:00Z";
      const sunset = "2024-06-15T20:00:00Z";
      expect(isWithinHoursOf(now, sunset, 2.5)).toBe(false);
    });
  });
});

// ============================================================================
// WEATHER SCORE TESTS
// ============================================================================

describe("scoreWeather", () => {
  it("returns high score for ideal conditions", () => {
    const weather: WeatherNow = {
      temp_f: 65,
      wind_mph: 5,
      precip_prob: 0.05,
      cloud_cover: 0.3,
    };

    const result = scoreWeather(weather);
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.warnings).toHaveLength(0);
  });

  it("reduces score for poor conditions", () => {
    const weather: WeatherNow = {
      temp_f: 95,
      wind_mph: 25,
      precip_prob: 0.6,
      cloud_cover: 0.8,
    };

    const result = scoreWeather(weather);
    expect(result.score).toBeLessThan(0.5);
  });

  it("adds warnings for dangerous alerts", () => {
    const weather: WeatherNow = {
      temp_f: 70,
      wind_mph: 10,
      precip_prob: 0.2,
      cloud_cover: 0.5,
      alerts: ["flash flood warning", "wind advisory"],
    };

    const result = scoreWeather(weather);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.toLowerCase().includes("flash flood"))).toBe(true);
  });

  it("generates appropriate reasons", () => {
    const weather: WeatherNow = {
      temp_f: 68,
      wind_mph: 5,
      precip_prob: 0.1,
      cloud_cover: 0.4,
    };

    const result = scoreWeather(weather);
    expect(result.reasons.some(r => r.includes("Comfortable") || r.includes("Low wind"))).toBe(true);
  });
});

// ============================================================================
// CONDITIONS SCORE TESTS
// ============================================================================

describe("scoreConditions", () => {
  const baseHike: Hike = {
    id: "test-hike",
    name: "Test Trail",
    location: { lat: 37.5, lon: -122.0 },
    distance_miles: 5,
    elevation_gain_ft: 1000,
  };

  const goodWeather: WeatherNow = {
    temp_f: 65,
    wind_mph: 5,
    precip_prob: 0.1,
    cloud_cover: 0.3,
  };

  it("penalizes high-clearance roads for 2WD vehicles", () => {
    const hike: Hike = {
      ...baseHike,
      access_road_type: "high_clearance",
    };

    const result2wd = scoreConditions(hike, goodWeather, "2wd");
    const result4x4 = scoreConditions(hike, goodWeather, "4x4");

    expect(result2wd.score).toBeLessThan(result4x4.score);
    expect(result2wd.warnings.some(w => w.includes("2WD"))).toBe(true);
  });

  it("handles AWD on high-clearance roads", () => {
    const hike: Hike = {
      ...baseHike,
      access_road_type: "high_clearance",
    };

    const resultAwd = scoreConditions(hike, goodWeather, "awd");
    const result2wd = scoreConditions(hike, goodWeather, "2wd");
    const result4x4 = scoreConditions(hike, goodWeather, "4x4");

    // AWD should be between 2WD and 4x4
    expect(resultAwd.score).toBeGreaterThan(result2wd.score);
    expect(resultAwd.score).toBeLessThan(result4x4.score);
  });

  it("penalizes high seasonal closure risk", () => {
    const hikeHighRisk: Hike = {
      ...baseHike,
      seasonal_closure_risk: "high",
    };

    const hikeLowRisk: Hike = {
      ...baseHike,
      seasonal_closure_risk: "low",
    };

    const resultHigh = scoreConditions(hikeHighRisk, goodWeather);
    const resultLow = scoreConditions(hikeLowRisk, goodWeather);

    expect(resultHigh.score).toBeLessThan(resultLow.score);
    expect(resultHigh.warnings.some(w => w.includes("closure"))).toBe(true);
  });

  it("adds mud risk warning for wet + elevated trails", () => {
    const hike: Hike = {
      ...baseHike,
      elevation_gain_ft: 1500,
    };

    const wetWeather: WeatherNow = {
      ...goodWeather,
      precip_prob: 0.6,
    };

    const result = scoreConditions(hike, wetWeather);
    expect(result.warnings.some(w => w.toLowerCase().includes("mud"))).toBe(true);
  });

  it("adds ice risk warning for freezing + precipitation", () => {
    const coldWetWeather: WeatherNow = {
      temp_f: 32,
      wind_mph: 5,
      precip_prob: 0.5,
      cloud_cover: 0.8,
    };

    const result = scoreConditions(baseHike, coldWetWeather);
    expect(result.warnings.some(w => w.toLowerCase().includes("ice") || w.toLowerCase().includes("frost"))).toBe(true);
  });
});

// ============================================================================
// LIGHT SCORE TESTS
// ============================================================================

describe("scoreLight", () => {
  const baseHike: Hike = {
    id: "test-hike",
    name: "Test Trail",
    location: { lat: 37.5, lon: -122.0 },
    distance_miles: 5,
    elevation_gain_ft: 1000,
  };

  const baseSun: SunInfo = {
    sunrise: "2024-06-15T06:00:00Z",
    sunset: "2024-06-15T20:30:00Z",
    solar_azimuth_deg: 270,
    solar_elevation_deg: 15,
  };

  const partialClouds: WeatherNow = {
    temp_f: 70,
    wind_mph: 5,
    precip_prob: 0.1,
    cloud_cover: 0.4,
  };

  it("boosts score near sunset", () => {
    const nearSunset = "2024-06-15T18:30:00Z"; // 2h before sunset
    const midday = "2024-06-15T12:00:00Z";

    const resultNearSunset = scoreLight(baseHike, baseSun, partialClouds, nearSunset);
    const resultMidday = scoreLight(baseHike, baseSun, partialClouds, midday);

    expect(resultNearSunset.score).toBeGreaterThan(resultMidday.score);
    expect(resultNearSunset.reasons.some(r => r.toLowerCase().includes("golden"))).toBe(true);
  });

  it("boosts score near sunrise", () => {
    const nearSunrise = "2024-06-15T07:00:00Z"; // 1h after sunrise
    const midday = "2024-06-15T12:00:00Z";

    const resultNearSunrise = scoreLight(baseHike, baseSun, partialClouds, nearSunrise);
    const resultMidday = scoreLight(baseHike, baseSun, partialClouds, midday);

    expect(resultNearSunrise.score).toBeGreaterThan(resultMidday.score);
  });

  it("boosts west-facing aspects near sunset", () => {
    const westFacingHike: Hike = { ...baseHike, aspect: "SW" };
    const eastFacingHike: Hike = { ...baseHike, aspect: "E" };
    const nearSunset = "2024-06-15T18:00:00Z";

    const resultWest = scoreLight(westFacingHike, baseSun, partialClouds, nearSunset);
    const resultEast = scoreLight(eastFacingHike, baseSun, partialClouds, nearSunset);

    expect(resultWest.score).toBeGreaterThan(resultEast.score);
    expect(resultWest.reasons.some(r => r.includes("sunset"))).toBe(true);
  });

  it("boosts east-facing aspects in morning", () => {
    const eastFacingHike: Hike = { ...baseHike, aspect: "E" };
    const westFacingHike: Hike = { ...baseHike, aspect: "W" };
    const morning = "2024-06-15T07:30:00Z"; // 1.5h after sunrise

    const resultEast = scoreLight(eastFacingHike, baseSun, partialClouds, morning);
    const resultWest = scoreLight(westFacingHike, baseSun, partialClouds, morning);

    expect(resultEast.score).toBeGreaterThan(resultWest.score);
  });

  it("prefers partial clouds for dramatic light", () => {
    const partialCloudsWeather: WeatherNow = { ...partialClouds, cloud_cover: 0.4 };
    const overcastWeather: WeatherNow = { ...partialClouds, cloud_cover: 0.95 };
    const now = "2024-06-15T18:00:00Z";

    const resultPartial = scoreLight(baseHike, baseSun, partialCloudsWeather, now);
    const resultOvercast = scoreLight(baseHike, baseSun, overcastWeather, now);

    expect(resultPartial.score).toBeGreaterThan(resultOvercast.score);
  });
});

// ============================================================================
// EFFORT MATCH TESTS
// ============================================================================

describe("scoreEffortMatch", () => {
  it("scores easy hikes highly for easy preference", () => {
    const easyHike: Hike = {
      id: "easy",
      name: "Easy Trail",
      location: { lat: 37.5, lon: -122.0 },
      distance_miles: 2,
      elevation_gain_ft: 400,
    };

    const result = scoreEffortMatch(easyHike, { effort: "easy" });
    expect(result.score).toBeGreaterThan(0.9);
  });

  it("penalizes hard hikes for easy preference", () => {
    const hardHike: Hike = {
      id: "hard",
      name: "Hard Trail",
      location: { lat: 37.5, lon: -122.0 },
      distance_miles: 10,
      elevation_gain_ft: 3000,
    };

    const result = scoreEffortMatch(hardHike, { effort: "easy" });
    expect(result.score).toBeLessThan(0.5);
  });

  it("accepts moderate hikes for moderate preference", () => {
    const moderateHike: Hike = {
      id: "moderate",
      name: "Moderate Trail",
      location: { lat: 37.5, lon: -122.0 },
      distance_miles: 5,
      elevation_gain_ft: 1200,
    };

    const result = scoreEffortMatch(moderateHike, { effort: "moderate" });
    expect(result.score).toBeGreaterThan(0.8);
  });

  it("respects explicit max distance preference", () => {
    const hike: Hike = {
      id: "test",
      name: "Test Trail",
      location: { lat: 37.5, lon: -122.0 },
      distance_miles: 4,
      elevation_gain_ft: 800,
    };

    const result2mi = scoreEffortMatch(hike, { max_distance_miles: 2 });
    const result10mi = scoreEffortMatch(hike, { max_distance_miles: 10 });

    expect(result10mi.score).toBeGreaterThan(result2mi.score);
  });

  it("uses smooth scoring rather than hard cutoffs", () => {
    const slightlyOver: Hike = {
      id: "slightly-over",
      name: "Slightly Over",
      location: { lat: 37.5, lon: -122.0 },
      distance_miles: 3.5, // slightly over easy max of 3
      elevation_gain_ft: 600,
    };

    const result = scoreEffortMatch(slightlyOver, { effort: "easy" });
    // Should still have reasonable score, not 0
    expect(result.score).toBeGreaterThan(0.5);
  });
});

// ============================================================================
// CROWD SCORE TESTS
// ============================================================================

describe("scoreCrowd", () => {
  it("returns high score for unpopular trails", () => {
    const unpopularHike: Hike = {
      id: "quiet",
      name: "Quiet Trail",
      location: { lat: 37.5, lon: -122.0 },
      distance_miles: 5,
      elevation_gain_ft: 1000,
      popularity: 0.2,
    };

    const result = scoreCrowd(unpopularHike);
    expect(result.score).toBeGreaterThan(0.7);
  });

  it("returns low score for popular trails", () => {
    const popularHike: Hike = {
      id: "busy",
      name: "Popular Trail",
      location: { lat: 37.5, lon: -122.0 },
      distance_miles: 5,
      elevation_gain_ft: 1000,
      popularity: 0.9,
    };

    const result = scoreCrowd(popularHike);
    expect(result.score).toBeLessThan(0.3);
  });

  it("amplifies penalty for crowd-avoiding users", () => {
    const popularHike: Hike = {
      id: "busy",
      name: "Popular Trail",
      location: { lat: 37.5, lon: -122.0 },
      distance_miles: 5,
      elevation_gain_ft: 1000,
      popularity: 0.7,
    };

    const resultAvoid = scoreCrowd(popularHike, { crowd_tolerance: "avoid" });
    const resultNeutral = scoreCrowd(popularHike, { crowd_tolerance: "neutral" });

    expect(resultAvoid.score).toBeLessThan(resultNeutral.score);
  });

  it("dampens penalty for dont_care users", () => {
    const popularHike: Hike = {
      id: "busy",
      name: "Popular Trail",
      location: { lat: 37.5, lon: -122.0 },
      distance_miles: 5,
      elevation_gain_ft: 1000,
      popularity: 0.8,
    };

    const resultDontCare = scoreCrowd(popularHike, { crowd_tolerance: "dont_care" });
    const resultNeutral = scoreCrowd(popularHike, { crowd_tolerance: "neutral" });

    expect(resultDontCare.score).toBeGreaterThan(resultNeutral.score);
  });

  it("returns neutral score when popularity unknown", () => {
    const unknownHike: Hike = {
      id: "unknown",
      name: "Unknown Trail",
      location: { lat: 37.5, lon: -122.0 },
      distance_miles: 5,
      elevation_gain_ft: 1000,
      // No popularity field
    };

    const result = scoreCrowd(unknownHike);
    expect(result.score).toBeCloseTo(0.6);
  });
});

// ============================================================================
// PENALTY TESTS
// ============================================================================

describe("calculatePenalties", () => {
  const baseHike: Hike = {
    id: "test",
    name: "Test Trail",
    location: { lat: 37.5, lon: -122.0 },
    distance_miles: 5,
    elevation_gain_ft: 1000,
  };

  it("applies severe penalty for dangerous alerts", () => {
    const weather: WeatherNow = {
      temp_f: 70,
      wind_mph: 10,
      precip_prob: 0.2,
      cloud_cover: 0.5,
      alerts: ["flash flood warning"],
    };

    const result = calculatePenalties(baseHike, weather);
    expect(result.multiplier).toBeLessThanOrEqual(0.4);
    expect(result.warnings.some(w => w.toLowerCase().includes("dangerous"))).toBe(true);
  });

  it("applies penalty for extreme wind", () => {
    const weather: WeatherNow = {
      temp_f: 70,
      wind_mph: 35,
      precip_prob: 0.1,
      cloud_cover: 0.3,
    };

    const result = calculatePenalties(baseHike, weather);
    expect(result.multiplier).toBeLessThanOrEqual(0.7);
    expect(result.warnings.some(w => w.includes("wind"))).toBe(true);
  });

  it("applies penalty for high precip probability", () => {
    const weather: WeatherNow = {
      temp_f: 70,
      wind_mph: 10,
      precip_prob: 0.8,
      cloud_cover: 0.9,
    };

    const result = calculatePenalties(baseHike, weather);
    expect(result.multiplier).toBeLessThanOrEqual(0.8);
  });

  it("applies vehicle mismatch penalty", () => {
    const hike: Hike = {
      ...baseHike,
      access_road_type: "high_clearance",
    };

    const weather: WeatherNow = {
      temp_f: 70,
      wind_mph: 10,
      precip_prob: 0.1,
      cloud_cover: 0.3,
    };

    const result = calculatePenalties(hike, weather, "2wd");
    expect(result.multiplier).toBeLessThanOrEqual(0.75);
    expect(result.warnings.some(w => w.includes("clearance"))).toBe(true);
  });

  it("stacks multiple penalties", () => {
    const hike: Hike = {
      ...baseHike,
      access_road_type: "high_clearance",
      trailhead_parking_confidence: "low",
    };

    const weather: WeatherNow = {
      temp_f: 70,
      wind_mph: 35,
      precip_prob: 0.8,
      cloud_cover: 0.9,
      alerts: ["thunderstorm warning"],
    };

    const result = calculatePenalties(hike, weather, "2wd");
    // Multiple penalties should compound
    expect(result.multiplier).toBeLessThan(0.3);
  });
});

// ============================================================================
// INTEGRATION TEST: scoreHikesToday
// ============================================================================

describe("scoreHikesToday", () => {
  const hikes: Hike[] = [
    {
      id: "ideal",
      name: "Perfect Trail",
      location: { lat: 37.5, lon: -122.0 },
      distance_miles: 4,
      elevation_gain_ft: 800,
      access_road_type: "paved",
      popularity: 0.3,
      aspect: "SW",
    },
    {
      id: "challenging",
      name: "Hard Trail",
      location: { lat: 37.6, lon: -122.1 },
      distance_miles: 12,
      elevation_gain_ft: 4000,
      access_road_type: "high_clearance",
      popularity: 0.2,
    },
    {
      id: "popular",
      name: "Crowded Trail",
      location: { lat: 37.4, lon: -121.9 },
      distance_miles: 3,
      elevation_gain_ft: 500,
      access_road_type: "paved",
      popularity: 0.95,
    },
  ];

  const ctx: ScoringContext = {
    user: { lat: 37.5, lon: -122.0 },
    nowIso: "2024-06-15T18:00:00Z", // Near sunset
    weatherByHikeId: {
      ideal: { temp_f: 68, wind_mph: 5, precip_prob: 0.05, cloud_cover: 0.4 },
      challenging: { temp_f: 55, wind_mph: 15, precip_prob: 0.2, cloud_cover: 0.6 },
      popular: { temp_f: 72, wind_mph: 8, precip_prob: 0.1, cloud_cover: 0.3 },
    },
    sunByHikeId: {
      ideal: { sunrise: "2024-06-15T06:00:00Z", sunset: "2024-06-15T20:30:00Z", solar_azimuth_deg: 280, solar_elevation_deg: 20 },
      challenging: { sunrise: "2024-06-15T06:00:00Z", sunset: "2024-06-15T20:30:00Z", solar_azimuth_deg: 280, solar_elevation_deg: 18 },
      popular: { sunrise: "2024-06-15T06:00:00Z", sunset: "2024-06-15T20:30:00Z", solar_azimuth_deg: 280, solar_elevation_deg: 22 },
    },
    userPreference: {
      effort: "moderate",
      crowd_tolerance: "neutral",
      vehicle: "awd",
    },
  };

  it("returns sorted results with ideal hike ranked first", () => {
    const results = scoreHikesToday(hikes, ctx);

    expect(results).toHaveLength(3);
    expect(results[0].hike.id).toBe("ideal");
    expect(results[0].score_0_100).toBeGreaterThan(results[1].score_0_100);
  });

  it("provides breakdown for each hike", () => {
    const results = scoreHikesToday(hikes, ctx);

    for (const result of results) {
      expect(result.breakdown).toHaveProperty("weather");
      expect(result.breakdown).toHaveProperty("conditions");
      expect(result.breakdown).toHaveProperty("light");
      expect(result.breakdown).toHaveProperty("effort_match");
      expect(result.breakdown).toHaveProperty("crowd");
      expect(result.breakdown).toHaveProperty("penalties");
    }
  });

  it("generates reasons for each hike", () => {
    const results = scoreHikesToday(hikes, ctx);

    for (const result of results) {
      expect(result.reasons_short.length).toBeGreaterThanOrEqual(2);
      expect(result.reasons_short.length).toBeLessThanOrEqual(4);
    }
  });

  it("penalizes crowded trail for avoid tolerance", () => {
    const avoidCrowdsCtx: ScoringContext = {
      ...ctx,
      userPreference: { ...ctx.userPreference, crowd_tolerance: "avoid" },
    };

    const results = scoreHikesToday(hikes, avoidCrowdsCtx);
    const popularHike = results.find(r => r.hike.id === "popular");
    const idealHike = results.find(r => r.hike.id === "ideal");

    expect(idealHike!.score_0_100).toBeGreaterThan(popularHike!.score_0_100);
  });

  it("skips hikes with missing weather data", () => {
    const incompleteCtx: ScoringContext = {
      ...ctx,
      weatherByHikeId: {
        ideal: ctx.weatherByHikeId.ideal,
        // Missing weather for 'challenging' and 'popular'
      },
    };

    const results = scoreHikesToday(hikes, incompleteCtx);
    expect(results).toHaveLength(1);
    expect(results[0].hike.id).toBe("ideal");
  });

  it("produces scores in 0-100 range", () => {
    const results = scoreHikesToday(hikes, ctx);

    for (const result of results) {
      expect(result.score_0_100).toBeGreaterThanOrEqual(0);
      expect(result.score_0_100).toBeLessThanOrEqual(100);
    }
  });
});
