import {
  ConditionInsight,
  PhotoConditions,
  TimingAdvice,
  TomorrowioValues,
  WeatherMetrics,
  ShotSuggestion,
  TimeSpecificForecast,
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

  // Cloud height specifics - only show when there are actually clouds
  if (cloudBase !== null && cloudCover >= 10) {
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
    } else if (cloudBase < 2 && cloudCover >= 20) {
      insights.push({
        label: 'Low Cloud Layer',
        description: 'Clouds below 2km may create moody atmosphere but could block horizon light',
        impact: 'neutral',
        icon: 'clouds',
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
 * Get seasonal photography insights based on location and time of year
 */
export function getSeasonalInsights(
  lat: number,
  elevationMeters: number,
  date: Date = new Date()
): ConditionInsight[] {
  const insights: ConditionInsight[] = [];
  const month = date.getMonth(); // 0-11
  const isNorthernHemisphere = lat > 0;

  // Determine season (for northern hemisphere, flip for southern)
  let season: 'winter' | 'spring' | 'summer' | 'fall';
  if (isNorthernHemisphere) {
    if (month >= 2 && month <= 4) season = 'spring';
    else if (month >= 5 && month <= 7) season = 'summer';
    else if (month >= 8 && month <= 10) season = 'fall';
    else season = 'winter';
  } else {
    if (month >= 2 && month <= 4) season = 'fall';
    else if (month >= 5 && month <= 7) season = 'winter';
    else if (month >= 8 && month <= 10) season = 'spring';
    else season = 'summer';
  }

  const absLat = Math.abs(lat);

  // Season-specific insights (always show one)
  if (season === 'winter') {
    if (elevationMeters >= 300) {
      insights.push({
        label: 'Peak Inversion Season',
        description: 'Winter mornings often produce valley fog — arrive early for sea of clouds',
        impact: 'positive',
        icon: 'calendar',
      });
    } else {
      insights.push({
        label: 'Winter Light',
        description: 'Low sun angle creates long shadows and warm side-light all day',
        impact: 'positive',
        icon: 'sun-horizon',
      });
    }
  } else if (season === 'fall') {
    insights.push({
      label: 'Prime Sunset Season',
      description: 'Autumn typically brings clearer air and more dramatic cloud formations',
      impact: 'positive',
      icon: 'sparkle',
    });
  } else if (season === 'spring') {
    insights.push({
      label: 'Variable Conditions',
      description: 'Spring weather is dynamic — dramatic clouds often follow clearing storms',
      impact: 'neutral',
      icon: 'calendar',
    });
  } else if (season === 'summer') {
    if (absLat < 40) {
      insights.push({
        label: 'Monsoon Season',
        description: 'Summer afternoons may bring dramatic storm clouds for photography',
        impact: 'neutral',
        icon: 'cloud-rain',
      });
    } else {
      insights.push({
        label: 'Extended Golden Hour',
        description: 'Summer golden hours last longer — more time to find compositions',
        impact: 'positive',
        icon: 'sun-horizon',
      });
    }
  }

  // Additional elevation insight
  if (elevationMeters >= 1000) {
    insights.push({
      label: 'High Elevation Advantage',
      description: 'Above typical cloud layers — potential for dramatic above-cloud views',
      impact: 'positive',
      icon: 'mountains',
    });
  }

  return insights;
}

/**
 * Convert wind direction degrees to cardinal direction
 */
export function getWindDirectionName(degrees: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}

/**
 * Analyze wind direction for sunset/sunrise photography
 * Clouds moving from west catch sunset light; from east catch sunrise light
 */
export function analyzeWindDirection(
  windDirection: number | undefined,
  cloudCover: number
): ConditionInsight | undefined {
  if (windDirection === undefined) return undefined;

  const dir = getWindDirectionName(windDirection);
  const hasClouds = cloudCover >= 15;

  // West/Southwest winds push clouds that catch sunset light
  if (windDirection >= 225 && windDirection <= 315) {
    return {
      label: hasClouds ? 'Clouds Favor Sunset' : 'Wind from West',
      description: hasClouds
        ? `Wind from ${dir} — clouds moving east will catch and reflect sunset light`
        : `Wind from ${dir} — if clouds develop, they\'ll move to catch sunset light`,
      impact: hasClouds ? 'positive' : 'neutral',
      icon: 'compass-west',
    };
  }

  // East/Northeast winds push clouds that catch sunrise light
  if (windDirection >= 45 && windDirection <= 135) {
    return {
      label: hasClouds ? 'Clouds Favor Sunrise' : 'Wind from East',
      description: hasClouds
        ? `Wind from ${dir} — clouds moving west will catch and reflect sunrise light`
        : `Wind from ${dir} — if clouds develop, they\'ll move to catch sunrise light`,
      impact: hasClouds ? 'positive' : 'neutral',
      icon: 'compass-east',
    };
  }

  // North/South winds - clouds move parallel to sun path
  if ((windDirection >= 315 || windDirection < 45) || (windDirection >= 135 && windDirection < 225)) {
    return {
      label: 'Wind from ' + dir,
      description: `Clouds ${hasClouds ? 'are' : 'would be'} moving ${windDirection < 45 || windDirection >= 315 ? 'south' : 'north'} along the horizon`,
      impact: 'neutral',
      icon: 'compass',
    };
  }

  return undefined;
}

/**
 * Generate shot type suggestions based on conditions
 */
export function generateShotSuggestions(
  data: TomorrowioValues,
  skyInsights: ConditionInsight[],
  atmosphereInsights: ConditionInsight[],
  windInsights: ConditionInsight[]
): ShotSuggestion[] {
  const suggestions: ShotSuggestion[] = [];
  const cloudCover = data.cloudCover ?? 0;
  const visibility = data.visibility ?? 10;
  const windSpeed = data.windSpeed ?? 0;
  const windMph = windSpeed * 2.237;
  const humidity = data.humidity ?? 50;
  const temp = data.temperature ?? 15;
  const dewPoint = data.dewPoint ?? 10;
  const dewDiff = temp - dewPoint;

  // Wide landscapes - when sky is interesting
  const hasDramaticSky = skyInsights.some(i =>
    i.label.includes('Dramatic') ||
    i.label.includes('Layered') ||
    i.label.includes('Post-Storm')
  );
  if (hasDramaticSky || (cloudCover >= 20 && cloudCover <= 70)) {
    suggestions.push({
      type: 'Wide Landscapes',
      reason: 'Dramatic clouds will add interest to wide compositions',
      icon: 'mountains',
    });
  }

  // Reflections - calm water
  if (windMph < 5) {
    suggestions.push({
      type: 'Reflections',
      reason: 'Calm winds — lakes and ponds will be mirror-like',
      icon: 'water',
    });
  }

  // Waterfalls/forests - overcast or soft light
  if (cloudCover > 80 || visibility < 8) {
    suggestions.push({
      type: 'Waterfalls & Forests',
      reason: 'Soft, diffused light is ideal for intimate forest scenes',
      icon: 'tree',
    });
  }

  // Fog/mist shots
  if (dewDiff <= 3 && humidity >= 85) {
    suggestions.push({
      type: 'Moody Atmosphere',
      reason: 'Mist conditions create ethereal, layered compositions',
      icon: 'fog',
    });
  }

  // Silhouettes - clear horizon
  if (cloudCover < 30 && visibility > 15) {
    suggestions.push({
      type: 'Silhouettes',
      reason: 'Clear horizon will create strong silhouette opportunities',
      icon: 'silhouette',
    });
  }

  // Long exposures - windy conditions
  if (windMph >= 8 && windMph <= 20 && cloudCover >= 30) {
    suggestions.push({
      type: 'Long Exposure Clouds',
      reason: 'Moving clouds can create dramatic streaks with ND filters',
      icon: 'timer',
    });
  }

  // Detail/macro - harsh or flat light
  if (cloudCover > 90 || (cloudCover < 10 && visibility > 15)) {
    suggestions.push({
      type: 'Details & Textures',
      reason: cloudCover > 90
        ? 'Flat light is perfect for texture and detail work'
        : 'Clear conditions favor close-up natural details',
      icon: 'magnify',
    });
  }

  // Astro potential - clear and dark
  if (cloudCover < 15 && visibility > 20) {
    suggestions.push({
      type: 'Night Sky Potential',
      reason: 'Clear skies may allow for star photography after dark',
      icon: 'stars',
    });
  }

  return suggestions.slice(0, 4); // Limit to top 4 suggestions
}

/**
 * Create time-specific forecast for sunrise or sunset
 */
export function createTimeSpecificForecast(
  targetTime: Date,
  hourlyData: TomorrowioValues[],
  hourlyTimestamps: Date[],
  type: 'sunrise' | 'sunset',
  goldenHour: { start: Date; end: Date },
  blueHour: { start: Date; end: Date }
): TimeSpecificForecast | undefined {
  if (!hourlyData.length || !hourlyTimestamps.length) return undefined;

  // Find the hourly data point closest to the target time
  const targetMs = targetTime.getTime();
  let closestIndex = 0;
  let closestDiff = Math.abs(hourlyTimestamps[0].getTime() - targetMs);

  for (let i = 1; i < hourlyTimestamps.length; i++) {
    const diff = Math.abs(hourlyTimestamps[i].getTime() - targetMs);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestIndex = i;
    }
  }

  // If more than 12 hours away, data isn't relevant (allows for showing next sunrise/sunset)
  if (closestDiff > 12 * 60 * 60 * 1000) return undefined;

  const data = hourlyData[closestIndex];
  const conditions: ConditionInsight[] = [];

  // Get temperature at this time
  const temperature = data.temperature ?? 15;

  // Analyze conditions at that specific time
  const cloudCover = data.cloudCover ?? 0;
  const cloudBase = data.cloudBase;
  const visibility = data.visibility ?? 10;
  const precipProb = data.precipitationProbability ?? 0;
  const windDirection = data.windDirection;

  // Cloud analysis for this time
  if (cloudCover >= 20 && cloudCover <= 60 && cloudBase !== null && cloudBase >= 3) {
    conditions.push({
      label: type === 'sunset' ? 'Good Sunset Clouds' : 'Good Sunrise Clouds',
      description: `${Math.round(cloudCover)}% cloud cover at ideal height for color`,
      impact: 'positive',
      icon: 'clouds-sun',
    });
  } else if (cloudCover > 85) {
    conditions.push({
      label: 'Heavy Cloud Cover',
      description: `${Math.round(cloudCover)}% clouds may block direct light`,
      impact: 'caution',
      icon: 'cloud-heavy',
    });
  } else if (cloudCover >= 60 && cloudCover <= 85) {
    conditions.push({
      label: 'Partly Cloudy',
      description: `${Math.round(cloudCover)}% coverage — watch for dramatic breaks`,
      impact: 'neutral',
      icon: 'clouds',
    });
  } else if (cloudCover >= 15 && cloudCover < 20) {
    conditions.push({
      label: 'Light Clouds',
      description: `${Math.round(cloudCover)}% coverage — subtle color accents possible`,
      impact: 'neutral',
      icon: 'clouds-sun',
    });
  } else {
    conditions.push({
      label: 'Clear Sky Expected',
      description: 'Minimal clouds — clean gradient light, good for silhouettes',
      impact: 'neutral',
      icon: 'sun',
    });
  }

  // Precipitation at target time
  if (precipProb > 50) {
    conditions.push({
      label: 'Rain Likely',
      description: `${Math.round(precipProb)}% chance of precipitation`,
      impact: 'negative',
      icon: 'rain',
    });
  }

  // Visibility at target time
  if (visibility < 5) {
    conditions.push({
      label: 'Low Visibility',
      description: `${visibility.toFixed(1)}km visibility — hazy conditions`,
      impact: 'caution',
      icon: 'haze',
    });
  } else if (visibility > 20) {
    conditions.push({
      label: 'Excellent Visibility',
      description: `${visibility.toFixed(0)}km visibility — crisp, clear conditions`,
      impact: 'positive',
      icon: 'eye',
    });
  }

  // Wind direction insight
  let windDirectionInsight: string | undefined;
  if (windDirection !== undefined && cloudCover >= 20) {
    const dir = getWindDirectionName(windDirection);
    if (type === 'sunset' && windDirection >= 225 && windDirection <= 315) {
      windDirectionInsight = `Wind from ${dir} pushing clouds to catch sunset light`;
    } else if (type === 'sunrise' && windDirection >= 45 && windDirection <= 135) {
      windDirectionInsight = `Wind from ${dir} pushing clouds to catch sunrise light`;
    }
  }

  // Determine overall for this time
  const positives = conditions.filter(c => c.impact === 'positive').length;
  const negatives = conditions.filter(c => c.impact === 'negative').length;
  let overall: 'excellent' | 'good' | 'fair' | 'challenging';

  if (negatives >= 1) overall = 'challenging';
  else if (positives >= 1 && negatives === 0) overall = cloudCover >= 20 && cloudCover <= 60 ? 'excellent' : 'good';
  else overall = 'fair';

  return {
    time: targetTime,
    temperature,
    conditions,
    overall,
    windDirection: windDirectionInsight,
    goldenHourStart: goldenHour.start,
    goldenHourEnd: goldenHour.end,
    blueHourStart: blueHour.start,
    blueHourEnd: blueHour.end,
  };
}

/**
 * Main function to analyze all conditions
 */
export function analyzePhotoConditions(
  data: TomorrowioValues,
  elevationMeters: number,
  goldenHour: { morning: { start: Date; end: Date }; evening: { start: Date; end: Date } },
  hoursAhead: number = 0,
  hourlyData?: TomorrowioValues[],
  hourlyTimestamps?: Date[],
  sunTimes?: { sunrise: Date; sunset: Date }
): PhotoConditions {
  const sky = analyzeSkyConditions(data);
  const atmosphere = analyzeAtmosphere(data);
  const precipitation = analyzePrecipitation(data, hourlyData);
  const wind = analyzeWind(data);
  const humidity = analyzeHumidity(data);
  const inversion = analyzeInversion(data, elevationMeters);
  const timing = analyzeTimingAdvice(data, hourlyData);

  // Add wind direction insight to sky conditions if relevant
  const windDirectionInsight = analyzeWindDirection(data.windDirection, data.cloudCover ?? 0);
  if (windDirectionInsight) {
    sky.push(windDirectionInsight);
  }

  // Generate shot suggestions
  const shotSuggestions = generateShotSuggestions(data, sky, atmosphere, wind);

  // Create time-specific forecasts if we have the data
  let sunriseForecast: TimeSpecificForecast | undefined;
  let sunsetForecast: TimeSpecificForecast | undefined;

  if (hourlyData && hourlyTimestamps && sunTimes) {
    sunriseForecast = createTimeSpecificForecast(
      sunTimes.sunrise,
      hourlyData,
      hourlyTimestamps,
      'sunrise',
      goldenHour.morning,
      { start: new Date(sunTimes.sunrise.getTime() - 30 * 60 * 1000), end: sunTimes.sunrise } // Blue hour before sunrise
    );
    sunsetForecast = createTimeSpecificForecast(
      sunTimes.sunset,
      hourlyData,
      hourlyTimestamps,
      'sunset',
      goldenHour.evening,
      { start: sunTimes.sunset, end: new Date(sunTimes.sunset.getTime() + 30 * 60 * 1000) } // Blue hour after sunset
    );
  }

  return {
    headline: generateHeadline(sky, atmosphere, precipitation, wind),
    sky,
    atmosphere,
    precipitation,
    wind,
    humidity,
    inversion,
    sunriseForecast,
    sunsetForecast,
    shotSuggestions,
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
    windDirection: data.windDirection ?? 0,
    precipProbability: data.precipitationProbability ?? 0,
    pressure: data.pressureSurfaceLevel ?? 1013,
  };
}
