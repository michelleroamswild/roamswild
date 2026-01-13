import {
  ConditionInsight,
  PhotoConditions,
  TimingAdvice,
  TomorrowioValues,
  WeatherMetrics,
} from '@/types/weather';

/**
 * Analyze sky/cloud conditions for photography
 */
export function analyzeSkyConditions(data: TomorrowioValues): ConditionInsight[] {
  const insights: ConditionInsight[] = [];
  const cloudCover = data.cloudCover ?? 0;
  const cloudBase = data.cloudBase;

  // Cloud coverage analysis
  if (cloudCover < 10) {
    insights.push({
      label: 'Clean but Minimal Color',
      description: 'Clear sky — light may lack drama without clouds to catch color',
      impact: 'neutral',
      icon: 'sun',
    });
  } else if (cloudCover >= 20 && cloudCover <= 60 && cloudBase !== null && cloudBase >= 5) {
    insights.push({
      label: 'Dramatic Color Potential',
      description: 'High clouds at ideal coverage will diffuse and scatter sunset light',
      impact: 'positive',
      icon: 'clouds-sun',
    });
  } else if (cloudCover >= 30 && cloudCover <= 50 && cloudBase !== null && cloudBase >= 2 && cloudBase < 5) {
    insights.push({
      label: 'Layered Sky',
      description: 'Mid-level clouds may create texture, rays, and depth',
      impact: 'positive',
      icon: 'clouds',
    });
  } else if (cloudCover < 20 && (cloudBase === null || cloudBase < 2)) {
    insights.push({
      label: 'Open Horizon',
      description: 'Clear horizon with minimal low clouds — clean light at sunset',
      impact: 'positive',
      icon: 'horizon',
    });
  } else if (cloudCover > 40 && cloudBase !== null && cloudBase < 1.5) {
    insights.push({
      label: 'Horizon May Be Obstructed',
      description: 'Low cloud cover may block direct sunset light at the horizon',
      impact: 'caution',
      icon: 'cloud-block',
    });
  } else if (cloudCover > 85) {
    insights.push({
      label: 'Overcast Sky',
      description: 'Heavy cloud cover — expect flat, diffused light',
      impact: 'negative',
      icon: 'cloud-heavy',
    });
  } else if (cloudCover >= 60 && cloudCover <= 85) {
    insights.push({
      label: 'Variable Conditions',
      description: 'Partially cloudy — dramatic breaks possible if clouds thin',
      impact: 'neutral',
      icon: 'clouds',
    });
  }

  // Cloud height specifics
  if (cloudBase !== null) {
    if (cloudBase >= 6) {
      insights.push({
        label: 'High Cirrus Present',
        description: 'Wispy high clouds catch light well before and after sunset',
        impact: 'positive',
        icon: 'cloud-high',
      });
    } else if (cloudBase >= 2 && cloudBase < 6 && cloudCover >= 20 && cloudCover <= 70) {
      insights.push({
        label: 'Mid-Altitude Canvas',
        description: 'Clouds at 2-6km altitude create excellent color reflection',
        impact: 'positive',
        icon: 'palette',
      });
    }
  }

  return insights;
}

/**
 * Analyze atmospheric conditions
 */
export function analyzeAtmosphere(data: TomorrowioValues): ConditionInsight[] {
  const insights: ConditionInsight[] = [];
  const visibility = data.visibility ?? 10;
  const humidity = data.humidity ?? 50;

  // Visibility analysis
  if (visibility > 20) {
    insights.push({
      label: 'Clear Air',
      description: 'Exceptional visibility — crisp details and sharp distant subjects',
      impact: 'positive',
      icon: 'eye',
    });
  } else if (visibility >= 10 && visibility <= 20) {
    insights.push({
      label: 'Atmospheric Depth',
      description: 'Light haze may add depth and soften contrast pleasantly',
      impact: 'neutral',
      icon: 'layers',
    });
  } else if (visibility < 10 && visibility >= 5) {
    insights.push({
      label: 'Soft Light',
      description: 'Moderate haze will soften contrast — good for portraits',
      impact: 'neutral',
      icon: 'haze',
    });
  } else if (visibility < 5) {
    insights.push({
      label: 'Hazy Light',
      description: 'Low visibility may mute colors and reduce contrast significantly',
      impact: 'caution',
      icon: 'haze-heavy',
    });
  }

  // Humidity effects on light
  if (humidity >= 60 && humidity <= 80 && visibility >= 10) {
    insights.push({
      label: 'Warm Diffusion',
      description: 'Moderate moisture in air may boost warm tones at golden hour',
      impact: 'positive',
      icon: 'warmth',
    });
  }

  return insights;
}

/**
 * Analyze precipitation and weather timing
 */
export function analyzePrecipitation(
  data: TomorrowioValues,
  hourlyData?: TomorrowioValues[]
): ConditionInsight[] {
  const insights: ConditionInsight[] = [];
  const precipProb = data.precipitationProbability ?? 0;

  // Current precipitation
  if (precipProb > 60) {
    insights.push({
      label: 'Unstable Conditions',
      description: 'High precipitation chance — shooting may be difficult',
      impact: 'negative',
      icon: 'rain',
    });
  } else if (precipProb > 30 && precipProb <= 60) {
    insights.push({
      label: 'Weather Watch',
      description: 'Moderate rain chance — be prepared with weather protection',
      impact: 'caution',
      icon: 'rain-chance',
    });
  }

  // Check for post-storm clearing using hourly data
  if (hourlyData && hourlyData.length >= 3) {
    const recentPrecip = hourlyData.slice(0, 2).some(h => (h.precipitationProbability ?? 0) > 40);
    const laterPrecip = hourlyData.slice(2, 5).every(h => (h.precipitationProbability ?? 0) < 30);

    if (recentPrecip && laterPrecip) {
      insights.push({
        label: 'Post-Storm Glow Potential',
        description: 'Clearing after rain often creates dramatic, vibrant colors',
        impact: 'positive',
        icon: 'rainbow',
      });
    }
  }

  // Snow conditions (cold + precip)
  const temp = data.temperature ?? 15;
  if (temp < 2 && precipProb > 20) {
    insights.push({
      label: 'High Alpenglow Chance',
      description: 'Snow-reflective clouds can create exceptional mountain glow',
      impact: 'positive',
      icon: 'mountain-sun',
    });
  }

  return insights;
}

/**
 * Analyze wind conditions
 */
export function analyzeWind(data: TomorrowioValues): ConditionInsight[] {
  const insights: ConditionInsight[] = [];
  const windSpeed = data.windSpeed ?? 0;
  const windGust = data.windGust ?? 0;
  const windMph = windSpeed * 2.237; // Convert m/s to mph
  const gustMph = windGust * 2.237;

  if (windMph < 5) {
    insights.push({
      label: 'Reflections Possible',
      description: 'Calm conditions — water surfaces may be mirror-like',
      impact: 'positive',
      icon: 'water',
    });
  } else if (windMph >= 5 && windMph <= 12) {
    insights.push({
      label: 'Dynamic Foreground',
      description: 'Light wind creates gentle movement in grasses and water',
      impact: 'neutral',
      icon: 'wind-light',
    });
  } else if (windMph > 15) {
    insights.push({
      label: 'Tripod Stability Alert',
      description: 'Strong winds may cause camera shake — use sturdy support',
      impact: 'caution',
      icon: 'wind-strong',
    });
  }

  // Gust warning
  if (gustMph > 25) {
    insights.push({
      label: 'Aerial Caution',
      description: 'Strong gusts — not recommended for drone photography',
      impact: 'negative',
      icon: 'drone-warning',
    });
  }

  return insights;
}

/**
 * Analyze humidity and fog conditions
 */
export function analyzeHumidity(data: TomorrowioValues): ConditionInsight[] {
  const insights: ConditionInsight[] = [];
  const humidity = data.humidity ?? 50;
  const temp = data.temperature ?? 15;
  const dewPoint = data.dewPoint ?? 10;
  const dewDiff = temp - dewPoint;

  if (humidity < 50) {
    insights.push({
      label: 'Crisp Light',
      description: 'Low humidity creates sharp contrast and clear conditions',
      impact: 'positive',
      icon: 'sparkle',
    });
  } else if (humidity >= 75 && humidity < 90) {
    insights.push({
      label: 'Soft Highlights',
      description: 'High humidity may create glowing, diffused highlights',
      impact: 'neutral',
      icon: 'glow',
    });
  }

  // Fog/mist potential
  if (dewDiff <= 3 && humidity >= 85) {
    insights.push({
      label: 'Possible Mist',
      description: 'Temperature near dew point — ground fog or mist likely',
      impact: 'neutral',
      icon: 'fog',
    });
  }

  return insights;
}

/**
 * Analyze inversion potential for elevated viewpoints
 */
export function analyzeInversion(
  data: TomorrowioValues,
  elevationMeters: number
): ConditionInsight | undefined {
  const pressure = data.pressureSurfaceLevel ?? 1013;
  const windSpeed = data.windSpeed ?? 5;
  const humidity = data.humidity ?? 50;
  const cloudBase = data.cloudBase;
  const windMph = windSpeed * 2.237;

  // Need high pressure, calm winds, high humidity
  let score = 0;
  const factors: string[] = [];

  if (pressure >= 1025) {
    score += 30;
    factors.push('high pressure');
  }
  if (windMph < 5) {
    score += 25;
    factors.push('calm winds');
  }
  if (humidity >= 80) {
    score += 20;
    factors.push('high humidity');
  }

  // Check if viewer would be above clouds
  if (cloudBase !== null && elevationMeters > 0) {
    const cloudBaseMeters = cloudBase * 1000;
    if (elevationMeters > cloudBaseMeters) {
      score += 30;
      factors.push('above cloud layer');
    }
  }

  if (score >= 50 && elevationMeters >= 500) {
    return {
      label: 'Sea of Clouds Potential',
      description: `Inversion conditions favorable — ${factors.slice(0, 2).join(', ')}. Valley fog possible from this elevation.`,
      impact: 'positive',
      icon: 'clouds-below',
    };
  }

  return undefined;
}

/**
 * Determine timing recommendation
 */
export function analyzeTimingAdvice(
  data: TomorrowioValues,
  hourlyData?: TomorrowioValues[]
): TimingAdvice {
  const precipProb = data.precipitationProbability ?? 0;

  // High precip = challenging
  if (precipProb > 70) {
    return {
      recommendation: 'flexible',
      reason: 'Weather may limit shooting windows — watch for breaks in the rain',
    };
  }

  // Check hourly trends for timing advice
  if (hourlyData && hourlyData.length >= 6) {
    const currentClouds = hourlyData[0]?.cloudCover ?? 0;
    const laterClouds = hourlyData.slice(3, 6).reduce((sum, h) => sum + (h.cloudCover ?? 0), 0) / 3;

    // Clouds increasing = stay after
    if (laterClouds > currentClouds + 15) {
      return {
        recommendation: 'stay-after',
        reason: 'Clouds increasing — peak color may come after sunset',
      };
    }

    // Clouds decreasing = shoot early
    if (laterClouds < currentClouds - 15) {
      return {
        recommendation: 'shoot-early',
        reason: 'Clouds thinning — best color likely at golden hour start',
      };
    }

    // Check precip trends
    const currentPrecip = hourlyData[0]?.precipitationProbability ?? 0;
    const laterPrecip = hourlyData[4]?.precipitationProbability ?? 0;

    if (laterPrecip > currentPrecip + 30) {
      return {
        recommendation: 'shoot-early',
        reason: 'Weather moving in — shoot before conditions change',
      };
    }
  }

  return {
    recommendation: 'either',
    reason: 'Stable conditions — both sunrise and sunset should work well',
  };
}

/**
 * Generate the main headline summary
 */
export function generateHeadline(
  skyInsights: ConditionInsight[],
  atmosphereInsights: ConditionInsight[],
  precipInsights: ConditionInsight[],
  windInsights: ConditionInsight[]
): string {
  // Look for the most impactful positive condition
  const allInsights = [...skyInsights, ...atmosphereInsights, ...precipInsights];
  const positive = allInsights.filter(i => i.impact === 'positive');
  const negative = allInsights.filter(i => i.impact === 'negative');

  if (negative.length > 0 && positive.length === 0) {
    return negative[0].description;
  }

  if (positive.length > 0) {
    // Prioritize dramatic conditions
    const dramatic = positive.find(i =>
      i.label.includes('Dramatic') ||
      i.label.includes('Post-Storm') ||
      i.label.includes('Alpenglow')
    );
    if (dramatic) return dramatic.description;

    // Fall back to first positive
    return positive[0].description;
  }

  // Neutral headline
  const sky = skyInsights[0];
  if (sky) return sky.description;

  return 'Variable conditions — worth scouting';
}

/**
 * Determine overall assessment
 */
export function assessOverall(
  skyInsights: ConditionInsight[],
  atmosphereInsights: ConditionInsight[],
  precipInsights: ConditionInsight[]
): 'excellent' | 'good' | 'fair' | 'challenging' {
  const allInsights = [...skyInsights, ...atmosphereInsights, ...precipInsights];
  const positiveCount = allInsights.filter(i => i.impact === 'positive').length;
  const negativeCount = allInsights.filter(i => i.impact === 'negative').length;
  const cautionCount = allInsights.filter(i => i.impact === 'caution').length;

  if (negativeCount >= 2) return 'challenging';
  if (negativeCount >= 1 || cautionCount >= 2) return 'fair';
  if (positiveCount >= 3) return 'excellent';
  if (positiveCount >= 1) return 'good';
  return 'fair';
}

/**
 * Get forecast confidence based on hours ahead
 */
export function getForecastConfidence(hoursAhead: number): number {
  if (hoursAhead <= 6) return 95;
  if (hoursAhead <= 12) return 85;
  if (hoursAhead <= 24) return 75;
  if (hoursAhead <= 48) return 60;
  return 45;
}

/**
 * Main function to analyze all conditions
 */
export function analyzePhotoConditions(
  data: TomorrowioValues,
  elevationMeters: number,
  goldenHour: { morning: { start: Date; end: Date }; evening: { start: Date; end: Date } },
  hoursAhead: number = 0,
  hourlyData?: TomorrowioValues[]
): PhotoConditions {
  const sky = analyzeSkyConditions(data);
  const atmosphere = analyzeAtmosphere(data);
  const precipitation = analyzePrecipitation(data, hourlyData);
  const wind = analyzeWind(data);
  const humidity = analyzeHumidity(data);
  const inversion = analyzeInversion(data, elevationMeters);
  const timing = analyzeTimingAdvice(data, hourlyData);

  return {
    headline: generateHeadline(sky, atmosphere, precipitation, wind),
    sky,
    atmosphere,
    precipitation,
    wind,
    humidity,
    inversion,
    timing,
    goldenHour,
    overall: assessOverall(sky, atmosphere, precipitation),
    confidence: getForecastConfidence(hoursAhead),
  };
}

/**
 * Extract raw metrics from API data
 */
export function extractMetrics(data: TomorrowioValues): WeatherMetrics {
  return {
    cloudCover: data.cloudCover ?? 0,
    cloudBase: data.cloudBase ?? null,
    visibility: data.visibility ?? 10,
    humidity: data.humidity ?? 50,
    temperature: data.temperature ?? 15,
    windSpeed: data.windSpeed ?? 0,
    windGust: data.windGust ?? 0,
    precipProbability: data.precipitationProbability ?? 0,
    pressure: data.pressureSurfaceLevel ?? 1013,
  };
}
