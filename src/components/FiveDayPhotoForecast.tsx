import {
  Sun,
  SunHorizon,
  Cloud,
  CloudSun,
  CloudRain,
  CheckCircle,
  WarningCircle,
  Info,
  Calendar,
  CircleNotch,
} from '@phosphor-icons/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PhotoWeatherForecast, DailyPhotoSummary } from '@/types/weather';

interface FiveDayPhotoForecastProps {
  forecast: PhotoWeatherForecast | null;
  loading?: boolean;
  compact?: boolean;
}

// Get status badge styling
function getStatusBadge(overall: 'excellent' | 'good' | 'fair' | 'challenging') {
  switch (overall) {
    case 'excellent':
      return {
        text: 'Excellent',
        shortText: 'Exc',
        class: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
        dotClass: 'bg-green-500',
      };
    case 'good':
      return {
        text: 'Good',
        shortText: 'Good',
        class: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        dotClass: 'bg-emerald-500',
      };
    case 'fair':
      return {
        text: 'Fair',
        shortText: 'Fair',
        class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
        dotClass: 'bg-amber-500',
      };
    case 'challenging':
      return {
        text: 'Challenging',
        shortText: 'Poor',
        class: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
        dotClass: 'bg-orange-500',
      };
  }
}

// Format day name
function formatDayName(date: Date, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

// Format short day name for compact view
function formatShortDayName(date: Date, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tmrw';
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

// Format date
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Get weather icon based on conditions
function getWeatherIcon(summary: DailyPhotoSummary) {
  const headline = summary.conditions?.headline?.toLowerCase() || '';

  if (headline.includes('rain') || headline.includes('precip')) {
    return CloudRain;
  }
  if (headline.includes('overcast') || headline.includes('heavy cloud')) {
    return Cloud;
  }
  if (headline.includes('cloud') || headline.includes('partly')) {
    return CloudSun;
  }
  return Sun;
}

export function FiveDayPhotoForecast({
  forecast,
  loading = false,
  compact = false,
}: FiveDayPhotoForecastProps) {
  if (loading) {
    if (compact) {
      return (
        <Card className="animate-pulse">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">5-Day Forecast</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex-shrink-0 w-20 h-24 bg-muted rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="w-5 h-5 text-primary" />
            5-Day Photo Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!forecast || !forecast.daily?.length) {
    return null;
  }

  // Compact horizontal card layout
  if (compact) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">5-Day Photo Forecast</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {forecast.daily.slice(0, 5).map((day, index) => {
              const sunriseBadge = day.conditions?.sunriseForecast
                ? getStatusBadge(day.conditions.sunriseForecast.overall)
                : null;
              const sunsetBadge = day.conditions?.sunsetForecast
                ? getStatusBadge(day.conditions.sunsetForecast.overall)
                : null;

              const sunriseTemp = day.conditions?.sunriseForecast?.temperature;
              const sunsetTemp = day.conditions?.sunsetForecast?.temperature;

              return (
                <div
                  key={index}
                  className={`p-2 rounded-lg border text-center ${
                    index === 0
                      ? 'bg-primary/5 border-primary/20'
                      : 'bg-muted/30 border-border/50'
                  }`}
                >
                  {/* Day name */}
                  <p className={`text-xs font-medium mb-2 ${
                    index === 0 ? 'text-primary' : 'text-foreground'
                  }`}>
                    {formatShortDayName(new Date(day.date), index)}
                  </p>

                  {/* Sunrise */}
                  <div className="flex items-center justify-center gap-1.5 mb-1.5">
                    <Sun className="w-3.5 h-3.5 text-amber-500" weight="fill" />
                    {sunriseBadge ? (
                      <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${sunriseBadge.class}`}>
                        {sunriseBadge.shortText}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">--</span>
                    )}
                  </div>

                  {/* Sunset */}
                  <div className="flex items-center justify-center gap-1.5">
                    <SunHorizon className="w-3.5 h-3.5 text-orange-500" weight="fill" />
                    {sunsetBadge ? (
                      <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${sunsetBadge.class}`}>
                        {sunsetBadge.shortText}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">--</span>
                    )}
                  </div>

                  {/* Temperature */}
                  {sunsetTemp !== undefined && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      {Math.round(sunsetTemp * 9/5 + 32)}°F
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full layout
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="w-5 h-5 text-primary" />
          5-Day Photo Forecast
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-2">
        {forecast.daily.slice(0, 5).map((day, index) => {
          const sunriseBadge = day.conditions?.sunriseForecast
            ? getStatusBadge(day.conditions.sunriseForecast.overall)
            : null;
          const sunsetBadge = day.conditions?.sunsetForecast
            ? getStatusBadge(day.conditions.sunsetForecast.overall)
            : null;
          const WeatherIcon = getWeatherIcon(day);

          // Get temperatures if available
          const sunriseTemp = day.conditions?.sunriseForecast?.temperature;
          const sunsetTemp = day.conditions?.sunsetForecast?.temperature;

          return (
            <div
              key={index}
              className={`p-3 rounded-lg border ${
                index === 0
                  ? 'bg-primary/5 border-primary/20'
                  : 'bg-muted/30 border-transparent'
              }`}
            >
              {/* Day header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <WeatherIcon
                    className={`w-5 h-5 ${
                      index === 0 ? 'text-primary' : 'text-muted-foreground'
                    }`}
                    weight="duotone"
                  />
                  <div>
                    <span className="font-medium text-foreground">
                      {formatDayName(new Date(day.date), index)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {formatDate(new Date(day.date))}
                    </span>
                  </div>
                </div>
                {day.bestTime !== 'either' && (
                  <span className="text-xs text-muted-foreground">
                    Best: {day.bestTime === 'sunrise' ? 'AM' : 'PM'}
                  </span>
                )}
              </div>

              {/* Sunrise/Sunset status */}
              <div className="grid grid-cols-2 gap-2">
                {/* Sunrise */}
                <div className="flex items-center gap-2 p-2 bg-amber-50/50 dark:bg-amber-900/10 rounded-lg">
                  <Sun className="w-4 h-4 text-amber-500" weight="fill" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-foreground">Sunrise</span>
                      {sunriseTemp !== undefined && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          {Math.round(sunriseTemp * 9/5 + 32)}°F
                        </span>
                      )}
                    </div>
                    {sunriseBadge ? (
                      <span
                        className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium mt-0.5 ${sunriseBadge.class}`}
                      >
                        {sunriseBadge.text}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">--</span>
                    )}
                  </div>
                </div>

                {/* Sunset */}
                <div className="flex items-center gap-2 p-2 bg-orange-50/50 dark:bg-orange-900/10 rounded-lg">
                  <SunHorizon className="w-4 h-4 text-orange-500" weight="fill" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-foreground">Sunset</span>
                      {sunsetTemp !== undefined && (
                        <span className="text-[10px] text-orange-600 dark:text-orange-400">
                          {Math.round(sunsetTemp * 9/5 + 32)}°F
                        </span>
                      )}
                    </div>
                    {sunsetBadge ? (
                      <span
                        className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium mt-0.5 ${sunsetBadge.class}`}
                      >
                        {sunsetBadge.text}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">--</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary for today */}
              {index === 0 && day.summary && (
                <p className="text-xs text-muted-foreground mt-2 line-clamp-1">
                  {day.summary}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
