// Photography Weather Types - Photographer-focused conditions

// Condition insight - a single weather observation with photo implications
export interface ConditionInsight {
  label: string;           // e.g., "Dramatic Color Potential"
  description: string;     // e.g., "High clouds 30-60% will catch and diffuse sunset light"
  impact: 'positive' | 'neutral' | 'caution' | 'negative';
  icon?: string;           // Icon hint for UI
}

// Timing advice for when to shoot
export interface TimingAdvice {
  recommendation: 'sunrise' | 'sunset' | 'either' | 'stay-after' | 'shoot-early' | 'flexible';
  reason: string;          // e.g., "Clouds increasing post-sunset — peak color may come later"
}

// Complete photography conditions analysis
export interface PhotoConditions {
  // Main headline summary
  headline: string;        // e.g., "Scattered high clouds likely to enhance sunset color"

  // Condition insights by category
  sky: ConditionInsight[];       // Cloud conditions
  atmosphere: ConditionInsight[]; // Visibility, haze, air quality
  precipitation: ConditionInsight[]; // Rain, snow, storm timing
  wind: ConditionInsight[];      // Wind speed, gusts, stability
  humidity: ConditionInsight[];  // Moisture, fog, mist

  // Special conditions
  inversion?: ConditionInsight;  // Cloud inversion potential
  alpenglow?: ConditionInsight;  // Mountain glow potential

  // Timing recommendations
  timing: TimingAdvice;
  goldenHour: {
    morning: { start: Date; end: Date };
    evening: { start: Date; end: Date };
  };

  // Overall assessment
  overall: 'excellent' | 'good' | 'fair' | 'challenging';
  confidence: number;      // 0-100% based on forecast distance
}

// Raw weather data from API (for display)
export interface WeatherMetrics {
  cloudCover: number;      // 0-100%
  cloudBase: number | null; // km
  visibility: number;      // km
  humidity: number;        // 0-100%
  temperature: number;     // °C
  windSpeed: number;       // m/s
  windGust: number;        // m/s
  precipProbability: number; // 0-100%
  pressure: number;        // hPa
}

// Full photo weather data for a point in time
export interface PhotoWeatherData {
  // Location & Time
  lat: number;
  lng: number;
  elevation: number;
  timestamp: Date;

  // Sun times
  sunrise: Date;
  sunset: Date;
  goldenHourMorning: { start: Date; end: Date };
  goldenHourEvening: { start: Date; end: Date };

  // Raw metrics (for data display)
  metrics: WeatherMetrics;

  // Photographer-focused analysis
  conditions: PhotoConditions;
}

// Daily summary for trip planning
export interface DailyPhotoSummary {
  date: Date;
  conditions: PhotoConditions;
  bestTime: 'sunrise' | 'sunset' | 'either';
  summary: string;         // e.g., "Good sunrise potential, challenging sunset"
}

// Full forecast
export interface PhotoWeatherForecast {
  current: PhotoWeatherData;
  hourly: PhotoWeatherData[];
  daily: DailyPhotoSummary[];
}

// Tomorrow.io API response types
export interface TomorrowioDataPoint {
  time: string;
  values: TomorrowioValues;
}

export interface TomorrowioValues {
  cloudCover?: number;
  cloudBase?: number | null;
  cloudCeiling?: number | null;
  visibility?: number;
  humidity?: number;
  temperature?: number;
  dewPoint?: number;
  precipitationProbability?: number;
  windSpeed?: number;
  windGust?: number;
  pressureSurfaceLevel?: number;
}

export interface TomorrowioResponse {
  timelines: {
    hourly?: TomorrowioDataPoint[];
    daily?: TomorrowioDataPoint[];
    minutely?: TomorrowioDataPoint[];
  };
  warnings?: Array<{ code: number; message: string }>;
}

// Legacy types for backwards compatibility during migration
export type SunRating = 'poor' | 'fair' | 'good' | 'great';
export type AtmosphereRating = 'hazy' | 'clear' | 'crisp' | 'exceptional';
export type BestWindow = 'sunrise' | 'sunset' | 'either' | 'midday' | 'skip';

export interface TimeRange {
  start: Date;
  end: Date;
}
