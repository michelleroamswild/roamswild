import {
  Camera,
  Sun,
  SunHorizon,
  Cloud,
  CloudSun,
  Eye,
  Drop,
  Wind,
  Warning,
  Mountains,
  Clock,
  CircleNotch,
  Sparkle,
  CloudRain,
  Waves,
  ThermometerSimple,
  ArrowRight,
  CheckCircle,
  WarningCircle,
  Info,
  Tree,
  Timer,
  MagnifyingGlass,
  Star,
  Compass,
  Image,
  ArrowsClockwise,
} from '@phosphor-icons/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PhotoWeatherForecast, ConditionInsight, PhotoConditions, ShotSuggestion, TimeSpecificForecast } from '@/types/weather';
import { formatTime, getTimeUntilGoldenHour, formatDuration } from '@/utils/sunCalc';

interface PhotoWeatherCardProps {
  forecast: PhotoWeatherForecast | null;
  loading?: boolean;
  error?: string | null;
  locationName?: string;
  fetchedAt?: Date | null;
  onRefresh?: () => void;
}

// Map icon strings to Phosphor icons
function getInsightIcon(iconName: string | undefined) {
  switch (iconName) {
    case 'sun':
      return Sun;
    case 'clouds-sun':
    case 'clouds':
      return CloudSun;
    case 'cloud-high':
    case 'cloud-heavy':
    case 'cloud-block':
      return Cloud;
    case 'horizon':
      return SunHorizon;
    case 'eye':
      return Eye;
    case 'layers':
    case 'haze':
    case 'haze-heavy':
      return Eye;
    case 'warmth':
    case 'sparkle':
      return Sparkle;
    case 'rain':
    case 'rain-chance':
    case 'rainbow':
      return CloudRain;
    case 'mountain-sun':
    case 'mountains':
      return Mountains;
    case 'water':
      return Waves;
    case 'wind-light':
    case 'wind-strong':
      return Wind;
    case 'drone-warning':
      return Warning;
    case 'glow':
    case 'fog':
      return Drop;
    case 'clouds-below':
      return Mountains;
    case 'palette':
      return Sparkle;
    case 'compass':
    case 'compass-west':
    case 'compass-east':
      return Compass;
    case 'tree':
      return Tree;
    case 'timer':
      return Timer;
    case 'magnify':
      return MagnifyingGlass;
    case 'stars':
      return Star;
    case 'silhouette':
      return Image;
    case 'sun-horizon':
      return SunHorizon;
    case 'cloud-rain':
      return CloudRain;
    default:
      return Info;
  }
}

// Get impact color classes
function getImpactColor(impact: ConditionInsight['impact']) {
  switch (impact) {
    case 'positive':
      return 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
    case 'neutral':
      return 'text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700';
    case 'caution':
      return 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
    case 'negative':
      return 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
  }
}

// Get overall assessment badge
function getOverallBadge(overall: PhotoConditions['overall']) {
  switch (overall) {
    case 'excellent':
      return {
        text: 'Excellent',
        class: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
        icon: CheckCircle,
      };
    case 'good':
      return {
        text: 'Good',
        class: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
        icon: CheckCircle,
      };
    case 'fair':
      return {
        text: 'Fair',
        class: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
        icon: Info,
      };
    case 'challenging':
      return {
        text: 'Challenging',
        class: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
        icon: WarningCircle,
      };
  }
}

// Get time-specific badge color
function getTimeSpecificBadge(overall: TimeSpecificForecast['overall']) {
  switch (overall) {
    case 'excellent':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    case 'good':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'fair':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    case 'challenging':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
  }
}

// Format relative time (e.g., "5 min ago")
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins === 1) return '1 min ago';
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1 hour ago';
  return `${diffHours} hours ago`;
}

export function PhotoWeatherCard({
  forecast,
  loading = false,
  error = null,
  locationName,
  fetchedAt,
  onRefresh,
}: PhotoWeatherCardProps) {
  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="w-5 h-5 text-blushorchid" />
            Photography Conditions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <CircleNotch className="w-6 h-6 text-muted-foreground animate-spin" />
            <span className="ml-2 text-sm text-muted-foreground">Analyzing conditions...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="w-5 h-5 text-blushorchid" />
            Photography Conditions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground text-sm">
            <p>{error}</p>
            {error.includes('API key') && (
              <p className="mt-2 text-xs">
                Add VITE_TOMORROW_IO_API_KEY to your .env file
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!forecast) {
    return null;
  }

  const { current } = forecast;
  const { conditions, metrics } = current;
  const goldenHourInfo = getTimeUntilGoldenHour(current.lat, current.lng);
  const overallBadge = getOverallBadge(conditions.overall);
  const OverallIcon = overallBadge.icon;

  // Get wind direction insight separately for display
  const windDirectionInsight = conditions.sky.find(i =>
    i.label.includes('Clouds Favor') || i.label.includes('Clouds Moving')
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="w-5 h-5 text-blushorchid" />
            Photography Conditions
          </CardTitle>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${overallBadge.class}`}>
            <OverallIcon className="w-3.5 h-3.5" weight="fill" />
            {overallBadge.text}
          </div>
        </div>
        {locationName && (
          <span className="text-sm text-muted-foreground">{locationName}</span>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Headline Summary - Use sunset forecast for relevance */}
        <div className="bg-gradient-to-r from-blushorchid/10 to-primary/5 rounded-lg p-4 border border-blushorchid/20">
          <p className="text-sm font-medium text-foreground leading-relaxed">
            {conditions.sunsetForecast?.conditions[0]?.description || conditions.headline}
          </p>
        </div>

        {/* Sunrise & Sunset Forecasts */}
        <div className="grid grid-cols-2 gap-3">
          {/* Sunrise */}
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2 mb-2">
              <Sun className="w-5 h-5 text-amber-500" weight="fill" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Sunrise</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{formatTime(current.sunrise)}</p>
                  {conditions.sunriseForecast?.temperature !== undefined && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                      <ThermometerSimple className="w-3 h-3" />
                      {Math.round(conditions.sunriseForecast.temperature * 9/5 + 32)}°F
                    </span>
                  )}
                </div>
              </div>
              {conditions.sunriseForecast && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getTimeSpecificBadge(conditions.sunriseForecast.overall)}`}>
                  {conditions.sunriseForecast.overall}
                </span>
              )}
            </div>
            {/* Timeline: Blue Hour → Sunrise → Golden Hour */}
            {conditions.sunriseForecast && (
              <div className="mb-2">
                <div className="flex items-center h-2 rounded-full overflow-hidden">
                  <div className="flex-1 h-full bg-blue-400/60" title="Blue Hour" />
                  <div className="w-1 h-full bg-amber-400" title="Sunrise" />
                  <div className="flex-1 h-full bg-amber-300/60" title="Golden Hour" />
                </div>
                <div className="flex justify-between text-[9px] text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                  <span>{formatTime(conditions.sunriseForecast.blueHourStart)}</span>
                  <span className="font-medium">{formatTime(current.sunrise)}</span>
                  <span>{formatTime(conditions.sunriseForecast.goldenHourEnd)}</span>
                </div>
              </div>
            )}
            {conditions.sunriseForecast?.conditions[0] && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {conditions.sunriseForecast.conditions[0].description}
              </p>
            )}
            {conditions.sunriseForecast?.windDirection && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                <Compass className="w-3 h-3" />
                {conditions.sunriseForecast.windDirection}
              </p>
            )}
          </div>

          {/* Sunset */}
          <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2 mb-2">
              <SunHorizon className="w-5 h-5 text-orange-500" weight="fill" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Sunset</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{formatTime(current.sunset)}</p>
                  {conditions.sunsetForecast?.temperature !== undefined && (
                    <span className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-0.5">
                      <ThermometerSimple className="w-3 h-3" />
                      {Math.round(conditions.sunsetForecast.temperature * 9/5 + 32)}°F
                    </span>
                  )}
                </div>
              </div>
              {conditions.sunsetForecast && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getTimeSpecificBadge(conditions.sunsetForecast.overall)}`}>
                  {conditions.sunsetForecast.overall}
                </span>
              )}
            </div>
            {/* Timeline: Golden Hour → Sunset → Blue Hour */}
            {conditions.sunsetForecast && (
              <div className="mb-2">
                <div className="flex items-center h-2 rounded-full overflow-hidden">
                  <div className="flex-1 h-full bg-orange-300/60" title="Golden Hour" />
                  <div className="w-1 h-full bg-orange-500" title="Sunset" />
                  <div className="flex-1 h-full bg-blue-400/60" title="Blue Hour" />
                </div>
                <div className="flex justify-between text-[9px] text-orange-600/80 dark:text-orange-400/80 mt-0.5">
                  <span>{formatTime(conditions.sunsetForecast.goldenHourStart)}</span>
                  <span className="font-medium">{formatTime(current.sunset)}</span>
                  <span>{formatTime(conditions.sunsetForecast.blueHourEnd)}</span>
                </div>
              </div>
            )}
            {conditions.sunsetForecast?.conditions[0] && (
              <p className="text-xs text-orange-700 dark:text-orange-300">
                {conditions.sunsetForecast.conditions[0].description}
              </p>
            )}
            {conditions.sunsetForecast?.windDirection && (
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 flex items-center gap-1">
                <Compass className="w-3 h-3" />
                {conditions.sunsetForecast.windDirection}
              </p>
            )}
          </div>
        </div>

        {/* Wind Direction Insight (if present) */}
        {windDirectionInsight && (
          <div className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${getImpactColor(windDirectionInsight.impact)}`}>
            <Compass className="w-4 h-4 mt-0.5 flex-shrink-0" weight="duotone" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{windDirectionInsight.label}</p>
              <p className="text-xs opacity-80 mt-0.5">{windDirectionInsight.description}</p>
            </div>
          </div>
        )}

        {/* Shot Suggestions */}
        {conditions.shotSuggestions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Suggested Shots
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {conditions.shotSuggestions.map((suggestion, index) => {
                const SuggestionIcon = getInsightIcon(suggestion.icon);
                return (
                  <div
                    key={index}
                    className="flex items-start gap-2 p-2 bg-primary/5 rounded-lg border border-primary/10"
                  >
                    <SuggestionIcon className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" weight="duotone" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">{suggestion.type}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{suggestion.reason}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timing Recommendation */}
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <Clock className="w-4 h-4 text-blushorchid mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                {conditions.timing.recommendation === 'stay-after'
                  ? 'Stay After Sunset'
                  : conditions.timing.recommendation === 'shoot-early'
                  ? 'Shoot Early'
                  : conditions.timing.recommendation === 'sunrise'
                  ? 'Best at Sunrise'
                  : conditions.timing.recommendation === 'sunset'
                  ? 'Best at Sunset'
                  : 'Flexible Timing'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {conditions.timing.reason}
              </p>
              {goldenHourInfo && (
                <p className="text-xs text-blushorchid mt-1.5 flex items-center gap-1">
                  <ArrowRight className="w-3 h-3" />
                  {goldenHourInfo.type === 'morning' ? 'Sunrise' : 'Sunset'} golden hour in{' '}
                  {formatDuration(goldenHourInfo.minutesUntil)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Sunset Condition Details */}
        {conditions.sunsetForecast?.conditions && conditions.sunsetForecast.conditions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Sunset Conditions
            </h4>
            <div className="space-y-2">
              {conditions.sunsetForecast.conditions.map((insight, index) => {
                const InsightIcon = getInsightIcon(insight.icon);
                return (
                  <div
                    key={index}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${getImpactColor(insight.impact)}`}
                  >
                    <InsightIcon className="w-4 h-4 mt-0.5 flex-shrink-0" weight="duotone" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{insight.label}</p>
                      <p className="text-xs opacity-80 mt-0.5">{insight.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Raw Metrics (collapsible summary) - Current conditions */}
        <details className="group">
          <summary className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            <ThermometerSimple className="w-3.5 h-3.5" />
            <span>View current conditions</span>
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between p-2 bg-muted/30 rounded">
              <span className="text-muted-foreground">Cloud Cover</span>
              <span className="font-medium">{Math.round(metrics.cloudCover)}%</span>
            </div>
            <div className="flex justify-between p-2 bg-muted/30 rounded">
              <span className="text-muted-foreground">Visibility</span>
              <span className="font-medium">{metrics.visibility.toFixed(1)} km</span>
            </div>
            <div className="flex justify-between p-2 bg-muted/30 rounded">
              <span className="text-muted-foreground">Humidity</span>
              <span className="font-medium">{Math.round(metrics.humidity)}%</span>
            </div>
            <div className="flex justify-between p-2 bg-muted/30 rounded">
              <span className="text-muted-foreground">Wind</span>
              <span className="font-medium">{(metrics.windSpeed * 2.237).toFixed(0)} mph</span>
            </div>
            {metrics.cloudBase && (
              <div className="flex justify-between p-2 bg-muted/30 rounded">
                <span className="text-muted-foreground">Cloud Base</span>
                <span className="font-medium">{metrics.cloudBase.toFixed(1)} km</span>
              </div>
            )}
            {metrics.windDirection > 0 && (
              <div className="flex justify-between p-2 bg-muted/30 rounded">
                <span className="text-muted-foreground">Wind Dir</span>
                <span className="font-medium">{Math.round(metrics.windDirection)}°</span>
              </div>
            )}
          </div>
        </details>

        {/* Confidence & Last Updated */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <span>Forecast confidence</span>
          <span className="font-medium">
            {conditions.confidence >= 80
              ? 'High'
              : conditions.confidence >= 50
              ? 'Moderate'
              : 'Low'}{' '}
            ({conditions.confidence}%)
          </span>
        </div>

        {/* Last Updated & Refresh */}
        {(fetchedAt || onRefresh) && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
            {fetchedAt && (
              <span>Updated {formatRelativeTime(fetchedAt)}</span>
            )}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className="flex items-center gap-1 text-primary hover:text-primary/80 disabled:opacity-50 font-medium"
              >
                <ArrowsClockwise className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Compact badge version for inline display
 */
interface PhotoWeatherBadgeProps {
  forecast: PhotoWeatherForecast | null;
}

export function PhotoWeatherBadge({ forecast }: PhotoWeatherBadgeProps) {
  if (!forecast) return null;

  const { conditions } = forecast.current;
  const overallBadge = getOverallBadge(conditions.overall);
  const OverallIcon = overallBadge.icon;

  // Find most notable insight
  const positiveInsight = [
    ...conditions.sky,
    ...conditions.atmosphere,
  ].find(i => i.impact === 'positive');

  return (
    <div className="inline-flex items-center gap-2">
      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${overallBadge.class}`}>
        <OverallIcon className="w-3 h-3" weight="fill" />
        {overallBadge.text}
      </div>
      {positiveInsight && (
        <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
          {positiveInsight.label}
        </span>
      )}
      {conditions.inversion && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
          Inversion
        </span>
      )}
    </div>
  );
}
