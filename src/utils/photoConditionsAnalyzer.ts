/**
 * Photography Conditions Analyzer v2
 *
 * Simple weighted scoring model for sunset/sunrise quality prediction.
 * Based on research from SunsetHue, SkyCandy, and meteorological studies.
 *
 * Key factors:
 * - High/Mid clouds (canvas for color)
 * - Clear low horizon (lets light through)
 * - Aerosol optical depth (scatters light for color)
 * - Humidity (lower = more vibrant)
 * - Clean air / post-storm conditions
 */

import { HorizonProfile } from './terrainVisibility';

// Types for Open-Meteo hourly data
export interface OpenMeteoHourly {
  time: string[];
  cloud_cover: number[];
  cloud_cover_low: number[];
  cloud_cover_mid: number[];
  cloud_cover_high: number[];
  visibility: number[];
  precipitation_probability: number[];
  precipitation: number[];
  weather_code: number[];
  wind_speed_10m: number[];
  wind_gusts_10m: number[];
  relative_humidity_2m: number[];
  temperature_2m: number[];
  dew_point_2m: number[];
  // Air quality data
  pm2_5?: number[];
  pm10?: number[];
  aerosol_optical_depth?: number[];
  dust?: number[];
  uv_index?: number[];
}

export interface PhotoInsight {
  factor: string;
  value: string;
  score: number;      // 0-100 for this factor
  weight: number;     // Weight in overall score
  description: string;
}

export interface PhotoForecast {
  // Overall score 0-100
  score: number;
  rating: 'excellent' | 'good' | 'fair' | 'poor';
  headline: string;

  // Individual factor scores
  insights: PhotoInsight[];

  // Raw data for display
  clouds: {
    high: number;
    mid: number;
    low: number;
    total: number;
  };

  atmosphere: {
    humidity: number;
    visibility: number;  // km
    aod: number | null;  // aerosol optical depth
    dust: number | null;
  };

  conditions: {
    precipitation: number;      // probability %
    isClearing: boolean;
    windSpeed: number;          // km/h
    fogRisk: boolean;
  };

  // Timing
  timing: {
    recommendation: string;
    reason: string;
  };
}

/**
 * Score cloud canvas (high + mid clouds)
 * Best: 30-70% coverage of high/mid clouds
 */
function scoreCloudCanvas(high: number, mid: number): { score: number; description: string } {
  const canvas = high + mid;

  // Ideal range is 30-70%
  if (canvas >= 30 && canvas <= 70) {
    // Perfect range - score based on how centered
    const center = 50;
    const distFromCenter = Math.abs(canvas - center);
    const score = 100 - distFromCenter; // 80-100 in this range
    return {
      score,
      description: `${canvas}% high/mid clouds — ideal canvas for color`,
    };
  } else if (canvas >= 20 && canvas < 30) {
    return {
      score: 60 + (canvas - 20), // 60-70
      description: `${canvas}% high/mid clouds — some color potential`,
    };
  } else if (canvas > 70 && canvas <= 85) {
    return {
      score: 70 - (canvas - 70), // 55-70
      description: `${canvas}% high/mid clouds — heavy but may have breaks`,
    };
  } else if (canvas < 20) {
    return {
      score: canvas * 3, // 0-60
      description: canvas < 10
        ? 'Very few clouds — minimal color canvas'
        : `${canvas}% high/mid clouds — limited canvas`,
    };
  } else {
    // > 85%
    return {
      score: Math.max(20, 55 - (canvas - 85)), // 20-55
      description: `${canvas}% high/mid clouds — overcast, colors may be muted`,
    };
  }
}

/**
 * Score clear horizon (low clouds)
 * Best: <30% low clouds
 */
function scoreClearHorizon(low: number): { score: number; description: string } {
  if (low < 15) {
    return {
      score: 100,
      description: 'Clear horizon — sun rays will reach clouds above',
    };
  } else if (low < 30) {
    return {
      score: 85 - (low - 15), // 70-85
      description: `${low}% low clouds — mostly clear horizon`,
    };
  } else if (low < 50) {
    return {
      score: 70 - (low - 30), // 50-70
      description: `${low}% low clouds — horizon partially blocked`,
    };
  } else if (low < 70) {
    return {
      score: 50 - (low - 50), // 30-50
      description: `${low}% low clouds — horizon mostly blocked`,
    };
  } else {
    return {
      score: Math.max(10, 30 - (low - 70)), // 10-30
      description: `${low}% low clouds — heavy horizon blockage`,
    };
  }
}

/**
 * Score aerosol optical depth
 * Moderate AOD (0.1-0.4) enhances colors through Rayleigh scattering
 * Too high (>0.6) creates haze and washes out colors
 */
function scoreAerosol(aod: number | null, dust: number | null): { score: number; description: string } {
  if (aod === null || aod === undefined) {
    // No data available - neutral score
    return {
      score: 50,
      description: 'Aerosol data unavailable',
    };
  }

  // Optimal AOD is around 0.1-0.3
  if (aod >= 0.1 && aod <= 0.3) {
    return {
      score: 90 + (aod >= 0.15 && aod <= 0.25 ? 10 : 0), // 90-100
      description: `AOD ${aod.toFixed(2)} — ideal for vibrant colors`,
    };
  } else if (aod < 0.1) {
    return {
      score: 70 + (aod * 200), // 70-90
      description: `AOD ${aod.toFixed(2)} — very clean air, subtle colors`,
    };
  } else if (aod <= 0.5) {
    return {
      score: 80 - ((aod - 0.3) * 100), // 60-80
      description: `AOD ${aod.toFixed(2)} — moderate haze may enhance colors`,
    };
  } else {
    // High AOD - hazy
    const score = Math.max(20, 60 - ((aod - 0.5) * 80));
    const dustNote = dust && dust > 10 ? ' (dust present)' : '';
    return {
      score,
      description: `AOD ${aod.toFixed(2)} — hazy conditions${dustNote}`,
    };
  }
}

/**
 * Score humidity
 * Lower humidity = more vibrant colors (less water vapor absorption)
 */
function scoreHumidity(humidity: number): { score: number; description: string } {
  if (humidity < 40) {
    return {
      score: 100,
      description: `${humidity}% humidity — crisp, vibrant colors expected`,
    };
  } else if (humidity < 60) {
    return {
      score: 80 + ((60 - humidity) / 2), // 80-90
      description: `${humidity}% humidity — good color saturation`,
    };
  } else if (humidity < 75) {
    return {
      score: 60 + ((75 - humidity)), // 60-75
      description: `${humidity}% humidity — colors may be slightly muted`,
    };
  } else if (humidity < 90) {
    return {
      score: 40 + ((90 - humidity) * 1.3), // 40-60
      description: `${humidity}% humidity — colors will be soft`,
    };
  } else {
    return {
      score: Math.max(20, 40 - (humidity - 90) * 2), // 20-40
      description: `${humidity}% humidity — very muted colors expected`,
    };
  }
}

/**
 * Score clean air / precipitation conditions
 * Post-storm = excellent (freshly washed air)
 * Active precipitation = poor
 */
function scoreCleanAir(
  hourlyData: OpenMeteoHourly,
  eventIndex: number
): { score: number; description: string; isClearing: boolean } {
  // Look at precipitation before and at the event
  const precipBefore: number[] = [];
  for (let i = Math.max(0, eventIndex - 4); i < eventIndex; i++) {
    precipBefore.push(hourlyData.precipitation[i] || 0);
  }

  const precipAtEvent = hourlyData.precipitation[eventIndex] || 0;
  const probAtEvent = hourlyData.precipitation_probability[eventIndex] || 0;

  const hadRecentRain = precipBefore.some(p => p > 0.5);
  const isClearing = hadRecentRain && precipAtEvent < 0.2 && probAtEvent < 30;

  if (isClearing) {
    return {
      score: 100,
      description: 'Post-storm clearing — exceptional color potential!',
      isClearing: true,
    };
  }

  if (precipAtEvent > 1 || probAtEvent > 70) {
    return {
      score: 20,
      description: 'Active precipitation likely — poor visibility',
      isClearing: false,
    };
  }

  if (probAtEvent > 40) {
    return {
      score: 50,
      description: `${probAtEvent}% rain chance — unstable conditions`,
      isClearing: false,
    };
  }

  // Check for fog
  const weatherCode = hourlyData.weather_code[eventIndex];
  if (weatherCode === 45 || weatherCode === 48) {
    return {
      score: 30,
      description: 'Fog expected — horizon obscured',
      isClearing: false,
    };
  }

  // Normal conditions
  return {
    score: 70,
    description: 'Stable conditions',
    isClearing: false,
  };
}

/**
 * Get rating from score
 */
function getRating(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (score >= 75) return 'excellent';
  if (score >= 55) return 'good';
  if (score >= 35) return 'fair';
  return 'poor';
}

/**
 * Generate headline based on conditions
 */
function generateHeadline(
  score: number,
  insights: PhotoInsight[],
  isClearing: boolean,
  clouds: { high: number; mid: number; low: number; total: number }
): string {
  if (isClearing) {
    return 'Storm clearing — exceptional sunset potential';
  }

  if (score >= 80) {
    if (clouds.high >= 20 && clouds.high <= 60) {
      return 'High clouds set the stage for vivid colors';
    }
    return 'Excellent conditions for photography';
  }

  if (score >= 65) {
    return 'Good color potential — worth shooting';
  }

  if (score >= 50) {
    if (clouds.total < 15) {
      return 'Clear skies — good for silhouettes';
    }
    if (clouds.low > 50) {
      return 'Low clouds blocking horizon — focus on upper sky';
    }
    return 'Mixed conditions — some color possible';
  }

  if (clouds.total > 90) {
    return 'Heavy overcast — minimal color expected';
  }

  return 'Challenging conditions for sunset color';
}

/**
 * Main function: Analyze conditions and produce photo forecast
 */
export function analyzePhotoConditions(
  hourlyData: OpenMeteoHourly,
  eventIndex: number,
  horizonProfile?: HorizonProfile
): PhotoForecast {
  // Get data at the event hour
  const high = hourlyData.cloud_cover_high[eventIndex] ?? 0;
  const mid = hourlyData.cloud_cover_mid[eventIndex] ?? 0;
  const low = hourlyData.cloud_cover_low[eventIndex] ?? 0;
  const total = hourlyData.cloud_cover[eventIndex] ?? 0;
  const visibility = (hourlyData.visibility[eventIndex] ?? 10000) / 1000; // km
  const humidity = hourlyData.relative_humidity_2m[eventIndex] ?? 50;
  const windSpeed = hourlyData.wind_speed_10m[eventIndex] ?? 0;
  const precipProb = hourlyData.precipitation_probability[eventIndex] ?? 0;
  const temp = hourlyData.temperature_2m[eventIndex] ?? 20;
  const dewPoint = hourlyData.dew_point_2m[eventIndex] ?? 10;

  // Air quality data (may be null)
  const aod = hourlyData.aerosol_optical_depth?.[eventIndex] ?? null;
  const dust = hourlyData.dust?.[eventIndex] ?? null;

  // Calculate individual factor scores
  const cloudCanvasResult = scoreCloudCanvas(high, mid);
  const clearHorizonResult = scoreClearHorizon(low);
  const aerosolResult = scoreAerosol(aod, dust);
  const humidityResult = scoreHumidity(humidity);
  const cleanAirResult = scoreCleanAir(hourlyData, eventIndex);

  // Weights for each factor (total = 100)
  const weights = {
    cloudCanvas: 40,
    clearHorizon: 20,
    aerosol: 15,
    humidity: 15,
    cleanAir: 10,
  };

  // Build insights array
  const insights: PhotoInsight[] = [
    {
      factor: 'Cloud Canvas',
      value: `${Math.round(high + mid)}%`,
      score: cloudCanvasResult.score,
      weight: weights.cloudCanvas,
      description: cloudCanvasResult.description,
    },
    {
      factor: 'Clear Horizon',
      value: `${Math.round(low)}% low`,
      score: clearHorizonResult.score,
      weight: weights.clearHorizon,
      description: clearHorizonResult.description,
    },
    {
      factor: 'Atmosphere',
      value: aod !== null ? `AOD ${aod.toFixed(2)}` : 'N/A',
      score: aerosolResult.score,
      weight: weights.aerosol,
      description: aerosolResult.description,
    },
    {
      factor: 'Humidity',
      value: `${Math.round(humidity)}%`,
      score: humidityResult.score,
      weight: weights.humidity,
      description: humidityResult.description,
    },
    {
      factor: 'Air Quality',
      value: cleanAirResult.isClearing ? 'Clearing' : 'Stable',
      score: cleanAirResult.score,
      weight: weights.cleanAir,
      description: cleanAirResult.description,
    },
  ];

  // Calculate weighted score
  const weightedScore =
    (cloudCanvasResult.score * weights.cloudCanvas +
      clearHorizonResult.score * weights.clearHorizon +
      aerosolResult.score * weights.aerosol +
      humidityResult.score * weights.humidity +
      cleanAirResult.score * weights.cleanAir) / 100;

  const score = Math.round(weightedScore);
  const rating = getRating(score);

  // Fog risk check
  const fogRisk = (temp - dewPoint) < 3 && humidity > 85;

  // Timing recommendation
  let timing: { recommendation: string; reason: string };
  if (cleanAirResult.isClearing) {
    timing = {
      recommendation: 'Arrive early',
      reason: 'Catch the clearing — best light as storm moves out',
    };
  } else if (low > 40 && (high + mid) > 30) {
    timing = {
      recommendation: 'Stay late',
      reason: 'Low clouds may break, revealing color above',
    };
  } else if (humidity > 80) {
    timing = {
      recommendation: 'Shoot early',
      reason: 'Colors peak before sun drops into haze',
    };
  } else {
    timing = {
      recommendation: 'Standard timing',
      reason: 'Arrive for golden hour, stay through blue hour',
    };
  }

  const clouds = { high, mid, low, total };
  const headline = generateHeadline(score, insights, cleanAirResult.isClearing, clouds);

  return {
    score,
    rating,
    headline,
    insights,
    clouds,
    atmosphere: {
      humidity,
      visibility,
      aod,
      dust,
    },
    conditions: {
      precipitation: precipProb,
      isClearing: cleanAirResult.isClearing,
      windSpeed,
      fogRisk,
    },
    timing,
  };
}
