/**
 * Photography Conditions Analyzer
 *
 * Analyzes weather data from Open-Meteo and terrain data to provide
 * photographer-focused insights about sunset/sunrise conditions.
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
}

export interface PhotoInsight {
  label: string;
  description: string;
  impact: 'excellent' | 'good' | 'neutral' | 'caution' | 'poor';
  category: 'clouds' | 'atmosphere' | 'precipitation' | 'wind' | 'humidity' | 'timing' | 'terrain';
}

export interface CloudTrend {
  direction: 'clearing' | 'building' | 'steady';
  description: string;
  recommendation: 'shoot-early' | 'stay-after' | 'flexible';
}

export interface PhotoForecast {
  // Overall rating
  overall: 'excellent' | 'good' | 'fair' | 'poor';
  headline: string;

  // Individual insights
  insights: PhotoInsight[];

  // Cloud analysis
  cloudAnalysis: {
    high: number;
    mid: number;
    low: number;
    total: number;
    trend: CloudTrend;
    colorPotential: 'excellent' | 'good' | 'fair' | 'poor';
  };

  // Atmospheric conditions
  atmosphere: {
    visibility: number; // km
    visibilityRating: 'crisp' | 'atmospheric' | 'hazy';
    humidity: number;
    humidityEffect: string;
    fogRisk: boolean;
  };

  // Wind conditions
  wind: {
    speed: number; // km/h
    gusts: number;
    reflectionsPossible: boolean;
    tripodStable: boolean;
  };

  // Precipitation
  precipitation: {
    probability: number;
    isClearing: boolean;
    postStormPotential: boolean;
  };

  // Terrain impact (if provided)
  terrain?: {
    effectiveHorizon: number;
    goldenHourVisible: number;
    colorImpact: string;
  };

  // Timing recommendation
  timing: {
    recommendation: 'shoot-early' | 'stay-after' | 'be-there-early' | 'flexible';
    reason: string;
  };
}

/**
 * Analyze cloud conditions for photography
 */
function analyzeCloudLayers(high: number, mid: number, low: number, total: number): {
  insights: PhotoInsight[];
  colorPotential: 'excellent' | 'good' | 'fair' | 'poor';
} {
  const insights: PhotoInsight[] = [];
  let colorPotential: 'excellent' | 'good' | 'fair' | 'poor' = 'fair';

  // High clouds analysis (best for color)
  if (high >= 20 && high <= 60) {
    insights.push({
      label: 'Dramatic Color Potential',
      description: `High clouds at ${high}% will catch and diffuse sunset light beautifully`,
      impact: 'excellent',
      category: 'clouds',
    });
    colorPotential = 'excellent';
  } else if (high >= 10 && high < 20) {
    insights.push({
      label: 'Light High Clouds',
      description: 'Wispy high clouds may add subtle color streaks',
      impact: 'good',
      category: 'clouds',
    });
    if (colorPotential !== 'excellent') colorPotential = 'good';
  } else if (high > 60 && high <= 80) {
    insights.push({
      label: 'Heavy High Clouds',
      description: 'Extensive high cloud cover — colors may be muted but widespread',
      impact: 'neutral',
      category: 'clouds',
    });
  } else if (high > 80) {
    insights.push({
      label: 'Overcast High Layer',
      description: 'Very heavy high clouds may diffuse light too much',
      impact: 'caution',
      category: 'clouds',
    });
    colorPotential = 'fair';
  }

  // Mid clouds analysis (texture and rays)
  if (mid >= 30 && mid <= 50) {
    insights.push({
      label: 'Layered Sky',
      description: `Mid-level clouds at ${mid}% create texture and potential light rays`,
      impact: 'good',
      category: 'clouds',
    });
    if (colorPotential === 'fair') colorPotential = 'good';
  } else if (mid > 70) {
    insights.push({
      label: 'Heavy Mid Clouds',
      description: 'Thick mid-level clouds may block some direct light',
      impact: 'caution',
      category: 'clouds',
    });
  }

  // Low clouds analysis - more nuanced approach
  // Low clouds aren't inherently bad - they can catch dramatic underlight
  if (low < 15) {
    insights.push({
      label: 'Open Horizon',
      description: 'Clear low sky — unobstructed view of sun near horizon',
      impact: 'good',
      category: 'clouds',
    });
  } else if (low >= 15 && low < 35) {
    // This range can actually be great for drama!
    insights.push({
      label: 'Low Cloud Drama',
      description: `Low clouds at ${low}% can catch dramatic underlight and add foreground interest`,
      impact: 'good',
      category: 'clouds',
    });
  } else if (low >= 35 && low < 60) {
    // Getting heavy but still can work
    insights.push({
      label: 'Heavy Low Clouds',
      description: `Low clouds at ${low}% may partially block horizon — watch for gaps and light rays`,
      impact: 'neutral',
      category: 'clouds',
    });
  } else if (low >= 60) {
    // Really blocked
    insights.push({
      label: 'Horizon Blocked',
      description: `Dense low clouds (${low}%) will block direct sunset — focus on upper sky colors and alpenglow`,
      impact: 'caution',
      category: 'clouds',
    });
    if (colorPotential === 'excellent') colorPotential = 'good';
  }

  // Total cloud cover analysis (based on SunsetHue research: 30-70% optimal)
  if (total < 20) {
    insights.push({
      label: 'Too Clear for Color',
      description: 'Very clear sky — minimal cloud canvas for color, focus on silhouettes and horizon glow',
      impact: 'neutral',
      category: 'clouds',
    });
    if (colorPotential === 'excellent') colorPotential = 'good';
    if (colorPotential === 'good') colorPotential = 'fair';
  } else if (total >= 20 && total < 30) {
    insights.push({
      label: 'Light Cloud Cover',
      description: 'Sparse clouds — some color potential but limited canvas',
      impact: 'neutral',
      category: 'clouds',
    });
  } else if (total >= 30 && total <= 70) {
    // Optimal range! Don't downgrade colorPotential
    insights.push({
      label: 'Ideal Cloud Coverage',
      description: `${total}% cloud cover is in the sweet spot (30-70%) for dramatic color`,
      impact: 'excellent',
      category: 'clouds',
    });
    if (colorPotential === 'fair') colorPotential = 'good';
  } else if (total > 70 && total <= 90) {
    insights.push({
      label: 'Heavy Cloud Cover',
      description: 'Lots of clouds — color depends on gaps and breaks in coverage',
      impact: 'neutral',
      category: 'clouds',
    });
  } else if (total > 90) {
    insights.push({
      label: 'Overcast Conditions',
      description: 'Very heavy cloud cover (>90%) blocks most light — minimal color expected',
      impact: 'poor',
      category: 'clouds',
    });
    colorPotential = 'poor';
  }

  // Bonus: Mid + High cloud combo is the ideal "canvas"
  const canvasClouds = high + mid;
  if (canvasClouds >= 30 && canvasClouds <= 70 && low < 30) {
    insights.push({
      label: 'Perfect Canvas',
      description: 'Mid and high clouds provide ideal canvas with clear low sky for light to pass through',
      impact: 'excellent',
      category: 'clouds',
    });
    colorPotential = 'excellent';
  }

  return { insights, colorPotential };
}

/**
 * Analyze cloud trends (clearing or building)
 */
function analyzeCloudTrend(
  hourlyData: OpenMeteoHourly,
  sunsetIndex: number
): CloudTrend {
  // Look at cloud cover 2 hours before to 1 hour after sunset
  const startIdx = Math.max(0, sunsetIndex - 2);
  const endIdx = Math.min(hourlyData.time.length - 1, sunsetIndex + 1);

  const beforeSunset = hourlyData.cloud_cover[startIdx];
  const atSunset = hourlyData.cloud_cover[sunsetIndex];
  const afterSunset = hourlyData.cloud_cover[endIdx];

  const changeBefore = atSunset - beforeSunset;
  const changeAfter = afterSunset - atSunset;

  // Clearing before sunset is great
  if (changeBefore < -15) {
    return {
      direction: 'clearing',
      description: `Skies clearing before sunset (${Math.abs(changeBefore).toFixed(0)}% decrease)`,
      recommendation: 'be-there-early',
    };
  }

  // Building after sunset - stay for colors
  if (changeAfter > 10) {
    return {
      direction: 'building',
      description: 'Clouds increasing after sunset — peak color may come later',
      recommendation: 'stay-after',
    };
  }

  // Clearing after sunset
  if (changeAfter < -10) {
    return {
      direction: 'clearing',
      description: 'Clouds thinning after sunset — shoot early for best color',
      recommendation: 'shoot-early',
    };
  }

  // Building before sunset - concerning
  if (changeBefore > 20) {
    return {
      direction: 'building',
      description: 'Clouds building toward sunset',
      recommendation: 'shoot-early',
    };
  }

  return {
    direction: 'steady',
    description: 'Cloud cover relatively stable around sunset',
    recommendation: 'flexible',
  };
}

/**
 * Analyze atmospheric conditions
 */
function analyzeAtmosphere(
  visibility: number, // meters
  humidity: number,
  temp: number,
  dewPoint: number
): {
  insights: PhotoInsight[];
  visibilityRating: 'crisp' | 'atmospheric' | 'hazy';
  fogRisk: boolean;
} {
  const insights: PhotoInsight[] = [];
  const visKm = visibility / 1000;

  let visibilityRating: 'crisp' | 'atmospheric' | 'hazy';

  if (visKm > 20) {
    visibilityRating = 'crisp';
    insights.push({
      label: 'Clear Air',
      description: 'Excellent visibility — crisp, sharp details',
      impact: 'good',
      category: 'atmosphere',
    });
  } else if (visKm >= 10) {
    visibilityRating = 'atmospheric';
    insights.push({
      label: 'Atmospheric Depth',
      description: 'Light haze may soften contrast and boost warm colors',
      impact: 'good',
      category: 'atmosphere',
    });
  } else {
    visibilityRating = 'hazy';
    insights.push({
      label: 'Hazy Light',
      description: 'Reduced visibility — colors may be muted and flat',
      impact: 'caution',
      category: 'atmosphere',
    });
  }

  // Humidity effects on color vibrancy
  // Research shows: lower humidity = more vibrant colors (less water vapor absorbing light)
  if (humidity < 40) {
    insights.push({
      label: 'Vibrant Color Potential',
      description: 'Low humidity (autumn/winter-like) allows more vibrant, saturated sunset colors',
      impact: 'excellent',
      category: 'humidity',
    });
  } else if (humidity >= 40 && humidity < 60) {
    insights.push({
      label: 'Good Color Conditions',
      description: 'Moderate humidity — colors will be nicely saturated',
      impact: 'good',
      category: 'humidity',
    });
  } else if (humidity >= 60 && humidity < 80) {
    insights.push({
      label: 'Muted Colors Expected',
      description: 'Higher humidity absorbs light — expect softer, less saturated colors',
      impact: 'neutral',
      category: 'humidity',
    });
  } else if (humidity >= 80) {
    insights.push({
      label: 'Washed Out Colors',
      description: 'High humidity (>80%) significantly mutes sunset colors — water vapor absorbs light',
      impact: 'caution',
      category: 'humidity',
    });
  }

  // Fog risk
  const fogRisk = (temp - dewPoint) < 3 && humidity > 85;
  if (fogRisk) {
    insights.push({
      label: 'Possible Mist',
      description: 'Temperature near dew point — fog or mist may form',
      impact: 'neutral',
      category: 'humidity',
    });
  }

  return { insights, visibilityRating, fogRisk };
}

/**
 * Analyze wind conditions
 */
function analyzeWind(
  speed: number, // km/h
  gusts: number
): {
  insights: PhotoInsight[];
  reflectionsPossible: boolean;
  tripodStable: boolean;
} {
  const insights: PhotoInsight[] = [];
  const speedMph = speed * 0.621;

  const reflectionsPossible = speedMph < 5;
  const tripodStable = speedMph < 15 && gusts * 0.621 < 20;

  if (speedMph < 5) {
    insights.push({
      label: 'Reflections Possible',
      description: 'Calm winds — excellent for water reflections',
      impact: 'excellent',
      category: 'wind',
    });
  } else if (speedMph >= 5 && speedMph <= 12) {
    insights.push({
      label: 'Dynamic Foreground',
      description: 'Light breeze — movement in grasses, gentle water ripples',
      impact: 'good',
      category: 'wind',
    });
  } else if (speedMph > 15) {
    insights.push({
      label: 'Tripod Unstable',
      description: 'Strong winds — use sturdy tripod, weight it down',
      impact: 'caution',
      category: 'wind',
    });
  }

  if (gusts * 0.621 > 25) {
    insights.push({
      label: 'Gusty Conditions',
      description: 'Strong gusts — caution with tall tripods and drones',
      impact: 'caution',
      category: 'wind',
    });
  }

  return { insights, reflectionsPossible, tripodStable };
}

/**
 * Analyze precipitation for post-storm potential
 */
function analyzePrecipitation(
  hourlyData: OpenMeteoHourly,
  sunsetIndex: number
): {
  insights: PhotoInsight[];
  isClearing: boolean;
  postStormPotential: boolean;
} {
  const insights: PhotoInsight[] = [];

  // Look at precipitation 1-3 hours before sunset
  const precipBefore = [];
  for (let i = Math.max(0, sunsetIndex - 3); i < sunsetIndex; i++) {
    precipBefore.push(hourlyData.precipitation[i] || 0);
  }

  const precipAtSunset = hourlyData.precipitation[sunsetIndex] || 0;
  const probAtSunset = hourlyData.precipitation_probability[sunsetIndex] || 0;

  const hadRecentRain = precipBefore.some(p => p > 0.5);
  const clearingNow = hadRecentRain && precipAtSunset < 0.2 && probAtSunset < 30;

  if (clearingNow) {
    insights.push({
      label: 'Post-Storm Glow Potential',
      description: 'Rain clearing before sunset — strong color potential as skies open',
      impact: 'excellent',
      category: 'precipitation',
    });
    return { insights, isClearing: true, postStormPotential: true };
  }

  if (precipAtSunset > 0.5 || probAtSunset > 60) {
    insights.push({
      label: 'Unstable Conditions',
      description: 'Precipitation likely during sunset — be prepared for changing conditions',
      impact: 'caution',
      category: 'precipitation',
    });
    return { insights, isClearing: false, postStormPotential: false };
  }

  // Check weather codes for special conditions
  const weatherCode = hourlyData.weather_code[sunsetIndex];

  // Fog codes (45, 48) - will block horizon
  if (weatherCode === 45 || weatherCode === 48) {
    insights.push({
      label: 'Fog Blocking Horizon',
      description: 'Fog reported — horizon will be obscured, but can create moody atmospheric shots',
      impact: 'caution',
      category: 'precipitation',
    });
  }

  // Snow conditions (71-77)
  if (weatherCode >= 71 && weatherCode <= 77) {
    insights.push({
      label: 'High Alpenglow Chance',
      description: 'Snow conditions — reflective clouds may create vibrant alpenglow',
      impact: 'good',
      category: 'precipitation',
    });
  }

  // Overcast codes (3) - thick clouds
  if (weatherCode === 3) {
    insights.push({
      label: 'Overcast Skies',
      description: 'Fully overcast — limited direct color but watch for breaks in clouds',
      impact: 'neutral',
      category: 'precipitation',
    });
  }

  return { insights, isClearing: false, postStormPotential: false };
}

/**
 * Analyze terrain impact on sunset viewing
 */
function analyzeTerrainImpact(
  horizonProfile: HorizonProfile,
  cloudLow: number
): PhotoInsight[] {
  const insights: PhotoInsight[] = [];

  if (horizonProfile.effectiveHorizon > 4) {
    // Significant terrain
    if (cloudLow < 20) {
      insights.push({
        label: 'Terrain Blocks Low Sun',
        description: `Sun sets behind ${horizonProfile.effectiveHorizon.toFixed(1)}° terrain — ${horizonProfile.sunsetLostMinutes} min of sunset lost, but sky colors still visible above`,
        impact: 'neutral',
        category: 'terrain',
      });
    } else {
      insights.push({
        label: 'Terrain + Low Clouds',
        description: `Both terrain (${horizonProfile.effectiveHorizon.toFixed(1)}°) and low clouds (${cloudLow}%) limit horizon view — focus on upper sky`,
        impact: 'caution',
        category: 'terrain',
      });
    }
  } else if (horizonProfile.effectiveHorizon > 0.5) {
    insights.push({
      label: 'Slight Terrain',
      description: `Minimal terrain obstruction (${horizonProfile.effectiveHorizon.toFixed(1)}°) — nearly full sunset visible`,
      impact: 'good',
      category: 'terrain',
    });
  }

  return insights;
}

/**
 * Main function: Analyze all conditions and produce photo forecast
 */
export function analyzePhotoConditions(
  hourlyData: OpenMeteoHourly,
  sunsetIndex: number,
  horizonProfile?: HorizonProfile
): PhotoForecast {
  // Get data at sunset hour
  const high = hourlyData.cloud_cover_high[sunsetIndex];
  const mid = hourlyData.cloud_cover_mid[sunsetIndex];
  const low = hourlyData.cloud_cover_low[sunsetIndex];
  const total = hourlyData.cloud_cover[sunsetIndex];
  const visibility = hourlyData.visibility[sunsetIndex];
  const humidity = hourlyData.relative_humidity_2m[sunsetIndex];
  const temp = hourlyData.temperature_2m[sunsetIndex];
  const dewPoint = hourlyData.dew_point_2m[sunsetIndex];
  const windSpeed = hourlyData.wind_speed_10m[sunsetIndex];
  const windGusts = hourlyData.wind_gusts_10m[sunsetIndex];

  // Analyze each aspect
  const cloudAnalysis = analyzeCloudLayers(high, mid, low, total);
  const cloudTrend = analyzeCloudTrend(hourlyData, sunsetIndex);
  const atmosphereAnalysis = analyzeAtmosphere(visibility, humidity, temp, dewPoint);
  const windAnalysis = analyzeWind(windSpeed, windGusts);
  const precipAnalysis = analyzePrecipitation(hourlyData, sunsetIndex);

  // Collect all insights
  let insights: PhotoInsight[] = [
    ...cloudAnalysis.insights,
    ...atmosphereAnalysis.insights,
    ...windAnalysis.insights,
    ...precipAnalysis.insights,
  ];

  // Add cloud trend insight
  if (cloudTrend.direction === 'clearing') {
    insights.push({
      label: 'Skies Clearing',
      description: cloudTrend.description,
      impact: 'excellent',
      category: 'timing',
    });
  } else if (cloudTrend.direction === 'building' && cloudTrend.recommendation === 'stay-after') {
    insights.push({
      label: 'Stay After Sunset',
      description: cloudTrend.description,
      impact: 'good',
      category: 'timing',
    });
  }

  // Terrain analysis
  let terrainData: PhotoForecast['terrain'] | undefined;
  if (horizonProfile) {
    const terrainInsights = analyzeTerrainImpact(horizonProfile, low);
    insights = [...insights, ...terrainInsights];

    terrainData = {
      effectiveHorizon: horizonProfile.effectiveHorizon,
      goldenHourVisible: horizonProfile.goldenHourVisible,
      colorImpact: horizonProfile.effectiveHorizon > 4
        ? 'Direct sunset blocked by terrain, focus on sky colors'
        : 'Full sunset visible above terrain',
    };
  }

  // Determine overall rating
  let overall: 'excellent' | 'good' | 'fair' | 'poor';
  const excellentCount = insights.filter(i => i.impact === 'excellent').length;
  const goodCount = insights.filter(i => i.impact === 'good').length;
  const cautionCount = insights.filter(i => i.impact === 'caution').length;
  const poorCount = insights.filter(i => i.impact === 'poor').length;

  if (poorCount >= 2 || (cloudAnalysis.colorPotential === 'poor' && !precipAnalysis.postStormPotential)) {
    overall = 'poor';
  } else if (precipAnalysis.postStormPotential || (excellentCount >= 2 && cautionCount < 2)) {
    overall = 'excellent';
  } else if (cloudAnalysis.colorPotential === 'excellent' || (goodCount >= 3 && cautionCount < 3)) {
    overall = 'good';
  } else if (cautionCount >= 3) {
    overall = 'poor';
  } else {
    overall = 'fair';
  }

  // Generate headline
  let headline: string;
  if (precipAnalysis.postStormPotential) {
    headline = 'Rain clearing before sunset — strong color potential';
  } else if (cloudTrend.direction === 'clearing') {
    headline = `Skies clearing toward sunset — ${cloudAnalysis.colorPotential} color expected`;
  } else if (cloudAnalysis.colorPotential === 'excellent') {
    headline = `High clouds at ${high}% likely to enhance sunset color`;
  } else if (cloudAnalysis.colorPotential === 'good') {
    headline = 'Good cloud structure for sunset color';
  } else if (total > 90) {
    headline = 'Heavy cloud cover — muted conditions expected';
  } else if (total < 10) {
    headline = 'Clear sky — subtle colors, great for silhouettes';
  } else {
    headline = 'Mixed conditions — worth scouting';
  }

  // Timing recommendation
  let timing: PhotoForecast['timing'];
  if (precipAnalysis.postStormPotential) {
    timing = {
      recommendation: 'be-there-early',
      reason: 'Clearing storm — arrive early to catch the break',
    };
  } else if (cloudTrend.recommendation === 'stay-after') {
    timing = {
      recommendation: 'stay-after',
      reason: cloudTrend.description,
    };
  } else if (cloudTrend.recommendation === 'shoot-early') {
    timing = {
      recommendation: 'shoot-early',
      reason: cloudTrend.description,
    };
  } else {
    timing = {
      recommendation: 'flexible',
      reason: 'Stable conditions — standard golden hour timing',
    };
  }

  return {
    overall,
    headline,
    insights,
    cloudAnalysis: {
      high,
      mid,
      low,
      total,
      trend: cloudTrend,
      colorPotential: cloudAnalysis.colorPotential,
    },
    atmosphere: {
      visibility: visibility / 1000,
      visibilityRating: atmosphereAnalysis.visibilityRating,
      humidity,
      humidityEffect: humidity > 80 ? 'Soft highlights' : humidity < 40 ? 'Crisp light' : 'Normal',
      fogRisk: atmosphereAnalysis.fogRisk,
    },
    wind: {
      speed: windSpeed,
      gusts: windGusts,
      reflectionsPossible: windAnalysis.reflectionsPossible,
      tripodStable: windAnalysis.tripodStable,
    },
    precipitation: {
      probability: hourlyData.precipitation_probability[sunsetIndex],
      isClearing: precipAnalysis.isClearing,
      postStormPotential: precipAnalysis.postStormPotential,
    },
    terrain: terrainData,
    timing,
  };
}
